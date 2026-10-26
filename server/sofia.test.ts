import {afterEach,describe,expect,it,vi} from "vitest";
import {sofiaAskSchema,sofiaHistorySchema} from "../shared/sofia";
import {redactPreviousPlan,redactQuestion,resolveTokenGroups} from "./sofiaPrivacy";
import {rawSofiaPlanSchema,validateAndResolvePlan,type SofiaQueryPlan} from "./sofiaPlan";
import {compileSofiaQuery,hasSofiaMention,localRefusal,localSofiaReply,withoutSofiaMention} from "./sofiaStore";
import {SofiaStore} from "./sofiaStore";
import {createSofiaPlan} from "./sofiaGemini";

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

describe("privacidade e validação da SofIA",()=>{
  it("substitui nomes, cidade, CPF, telefone e e-mail antes de qualquer envio à IA",()=>{
    const source="Busque Maria Garcia em São Paulo, CPF 111.222.333-44, celular +55 (11) 99999-8888 e e-mail maria@exemplo.com";
    const {redacted,map}=redactQuestion(source);
    for(const privateValue of ["Maria","Garcia","São","Paulo","111.222.333-44","+55","99999-8888","maria@exemplo.com"]){
      expect(redacted).not.toContain(privateValue);
    }
    expect(Array.from(map.values())).toContain("11");
    expect(redacted).toMatch(/\$V\d+/);expect(map.size).toBeGreaterThan(5);
  });
  it("anonimiza também os valores do plano anterior e só resolve tokens conhecidos",()=>{
    const plan:SofiaQueryPlan={entity:"patients",filters:[{field:"city",operator:"equals",values:["São Paulo"]}],sort:"name_asc",output:"list",limit:20};
    const map=new Map<string,string>();const previous=redactPreviousPlan(plan,map);
    expect(previous).not.toContain("São Paulo");expect(previous).toContain("$P1");
    expect(resolveTokenGroups([["$P1"]],map)).toEqual(["São Paulo"]);
    expect(()=>resolveTokenGroups([["São Paulo"]],map)).toThrow("SOFIA_UNKNOWN_VALUE_TOKEN");
    expect(()=>resolveTokenGroups([["$P99"]],map)).toThrow("SOFIA_UNKNOWN_VALUE_TOKEN");
  });
  it("recusa campos, formatos e valores livres fora do contrato",()=>{
    const base={action:"query",entity:"patients",filters:[],sort:"name_asc",output:"list",limit:20,reason:"none"};
    expect(rawSofiaPlanSchema.safeParse({...base,sql:"SELECT * FROM patients"}).success).toBe(false);
    expect(rawSofiaPlanSchema.safeParse({...base,limit:1000}).success).toBe(false);
    const map=new Map([["$V1","segredo"]]);
    expect(()=>validateAndResolvePlan({...base,filters:[{field:"category",operator:"equals",value_tokens:[["$V1"]]}]},map)).toThrow("SOFIA_FIELD_NOT_ALLOWED");
  });
});

describe("consultas seguras da SofIA",()=>{
  it("compila somente SQL parametrizado, inclusive curingas literais",()=>{
    const query=compileSofiaQuery({entity:"patients",filters:[
      {field:"name",operator:"contains_any",values:["Garcia","Soares%_"]},
      {field:"email",operator:"present",values:[]},
    ],sort:"name_asc",output:"count_and_list",limit:25});
    expect(query.countSql).not.toContain("Garcia");expect(query.listSql).not.toContain("Soares");
    expect(query.params).toEqual(["%Garcia%","%Soares\\%\\_%"]);expect(query.listSql).toContain("LIMIT ?");
    const cpf=compileSofiaQuery({entity:"patients",filters:[{field:"cpf",operator:"equals",values:["111.222.333-44"]}],sort:"name_asc",output:"list",limit:10});
    expect(cpf.countSql).toContain("REPLACE(REPLACE(REPLACE(`cpf`");expect(cpf.params).toEqual(["11122233344"]);
  });
  it("identifica a ativação no grupo e remove somente o gatilho",()=>{
    expect(hasSofiaMention("@SofIA, quantos pacientes há?")).toBe(true);
    expect(withoutSofiaMention("@SofIA, quantos pacientes há?")).toBe("quantos pacientes há?");
    expect(hasSofiaMention("contato@sofia.com")).toBe(false);
  });
  it("bloqueia localmente escrita, agendamento e orientação médica",()=>{
    expect(localRefusal("Altere o celular deste paciente")).toContain("somente para consultas");
    expect(localRefusal("Agende uma consulta amanhã")).toContain("não agenda");
    expect(localRefusal("Qual o tratamento para este sintoma?")).toContain("não forneço orientação médica");
    expect(localRefusal("Quais pacientes estão sem celular?")).toBeNull();
  });
  it("responde saudações localmente sem capturar perguntas que começam com olá",()=>{
    expect(localSofiaReply("Olá! ")).toContain("Olá! Sou a SofIA");
    expect(localSofiaReply("Bom dia SofIA")).toContain("buscar pacientes");
    expect(localSofiaReply("obrigada")).toContain("Por nada");
    expect(localSofiaReply("ola, td bem?")).toContain("Tudo bem por aqui");
    expect(localSofiaReply("Olá, quantos pacientes têm e-mail?")).toBeNull();
  });
  it("permite conversa sem consulta e impede tokens privados ou filtros em respostas de conversa",()=>{
    const chat={action:"chat",entity:"patients",filters:[],sort:"name_asc",output:"count",limit:20,reason:"none",reply:"Posso ajudar com buscas de pacientes e contatos."};
    expect(validateAndResolvePlan(chat,new Map())).toMatchObject({action:"chat",plan:null,reply:chat.reply});
    expect(()=>validateAndResolvePlan({...chat,reply:"Nome $V1"},new Map([["$V1","segredo"]]))).toThrow("SOFIA_INVALID_CHAT_REPLY");
    expect(()=>validateAndResolvePlan({...chat,reason:"medical_advice"},new Map())).toThrow("SOFIA_INVALID_CHAT_REPLY");
    expect(redactQuestion("Olá, como você pode ajudar?").redacted).not.toContain("$V");
    expect(redactQuestion("Quantos pacientes têm e-mail e fax?").redacted).not.toContain("$V");
  });
  it("valida entrada, cursor e idempotência do cliente",()=>{
    expect(sofiaAskSchema.safeParse({text:" ",clientId:crypto.randomUUID()}).success).toBe(false);
    expect(sofiaAskSchema.safeParse({text:"consulta",clientId:"invalido"}).success).toBe(false);
    expect(sofiaHistorySchema.safeParse({beforeId:2,afterId:3}).success).toBe(false);
  });
  it("sempre solicita store=false ao Gemini e exige resposta estruturada",async()=>{
    vi.stubEnv("SOFIA_ENABLED","true");vi.stubEnv("GEMINI_API_KEY","segredo-sintetico");
    const response={action:"query",entity:"patients",filters:[],sort:"name_asc",output:"count",limit:20,reason:"none"};
    const fetchMock=vi.fn(async(_url:string,init:any)=>new Response(JSON.stringify({output_text:`\`\`\`json\n${JSON.stringify(response)}\n\`\`\``}),{status:200,headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);
    await expect(createSofiaPlan("quantos pacientes", "nenhum")).resolves.toEqual(response);
    const request=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.store).toBe(false);expect(request.model).toBe("gemini-3.8-flash");
    expect(Object.keys(request).sort()).toEqual(["input","model","store"]);
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe("segredo-sintetico");
  });
  it("isola o histórico particular pelo usuário autenticado",async()=>{
    const query=vi.fn(async()=>[[]]);const release=vi.fn();
    const store=new SofiaStore({getConnection:vi.fn(async()=>({query,release}))} as any);
    await expect(store.history(73,{})).resolves.toEqual({messages:[],hasMore:false});
    expect(query.mock.calls[0][0]).toContain("WHERE ownerUserId=?");
    expect(query.mock.calls[0][1][0]).toBe(73);expect(release).toHaveBeenCalledOnce();
  });
  it("usa o Gemini Flash-Lite quando o principal está sobrecarregado e envia o contrato completo",async()=>{
    vi.stubEnv("GEMINI_API_KEY","segredo-sintetico");vi.stubEnv("GEMINI_MODEL","gemini-3.8-flash");
    const plan={action:"query",entity:"patients",filters:[{field:"email",operator:"present",value_tokens:[]}],sort:"name_asc",output:"count",limit:20,reason:"none"};
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response("indisponível",{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({steps:[{type:"model_output",content:[{type:"text",text:JSON.stringify(plan)}]}]}),{status:200}));
    vi.stubGlobal("fetch",fetchMock);
    await expect(createSofiaPlan("quantos pacientes com e-mail","nenhum")).resolves.toEqual(plan);
    const requests=fetchMock.mock.calls.map(call=>JSON.parse(call[1].body));
    expect(requests.map(request=>request.model)).toEqual(["gemini-3.8-flash","gemini-3.5-flash-lite"]);
    expect(requests[1].input).toBe(requests[0].input);expect(requests.every(request=>request.store===false)).toBe(true);
    expect(requests[0].input).toContain('"limit":20');expect(requests[0].input).toContain('"sort":"name_asc"');
  });
  it("não troca de modelo para erros de autenticação nem aceita planos fora do contrato",async()=>{
    vi.stubEnv("GEMINI_API_KEY","segredo-sintetico");
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response("não autorizado",{status:401}));
    vi.stubGlobal("fetch",fetchMock);
    await expect(createSofiaPlan("quantos pacientes","nenhum")).rejects.toThrow("SOFIA_GEMINI_REQUEST_FAILED_401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({output_text:JSON.stringify({sql:"SELECT * FROM patients"})}),{status:200}));
    await expect(createSofiaPlan("quantos pacientes","nenhum")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
