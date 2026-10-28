// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
const api=vi.hoisted(()=>({history:vi.fn(),send:vi.fn(),sendFile:vi.fn(),attachment:vi.fn(),read:vi.fn(),refetch:vi.fn(),data:null as any,sofiaAsk:vi.fn(),sofiaRefetch:vi.fn(),sofiaMessages:[] as any[]}));
vi.mock("@/lib/trpc",async()=>{
  const {useState}=await import("react");
  return {trpc:{
    useUtils:()=>({client:{chatMed:{history:{query:api.history},attachment:{query:api.attachment}},sofia:{history:{query:vi.fn(async()=>({messages:[],hasMore:false}))}}}}),
    chatMed:{
      threads:{useQuery:()=>({data:api.data,error:null,isLoading:false,refetch:api.refetch})},
      sendFile:{useMutation:()=>({error:null,isPending:false,mutateAsync:api.sendFile})},
      read:{useMutation:()=>({mutate:(input:any,options:any)=>{api.read(input);options?.onSuccess();}})},
      send:{useMutation:()=>{
        const [error,setError]=useState<Error|null>(null);
        const [isPending,setPending]=useState(false);
        return {error,isPending,mutateAsync:async(input:any)=>{
          setPending(true);setError(null);
          try{return await api.send(input);}catch(error){setError(error as Error);throw error;}finally{setPending(false);}
        }};
      }},
    },
    sofia:{
      history:{useQuery:()=>({data:{messages:api.sofiaMessages,hasMore:false},error:null,isLoading:false,refetch:api.sofiaRefetch})},
      ask:{useMutation:()=>{
        const [error,setError]=useState<Error|null>(null);const [isPending,setPending]=useState(false);
        return {error,isPending,mutateAsync:async(input:any)=>{setPending(true);setError(null);try{return await api.sofiaAsk(input);}catch(error){setError(error as Error);throw error;}finally{setPending(false);}}};
      }},
    },
  }};
});
import ChatMed,{mergeChatMessages} from "../components/ChatMed";
const first={id:1,senderId:2,senderName:"Colega fictícia",text:"Olá, equipe",createdAt:new Date("2026-10-19T10:00:00Z")};
beforeEach(()=>{
  vi.clearAllMocks();
  api.data={group:"equipe",mentionUnread:0,members:[{id:1,name:"Fixture A",username:"a"},{id:2,name:"Colega fictícia",username:"colega"}],unread:2,threads:[{peerId:null,name:"equipe",unread:1,lastMessage:"Olá, equipe",lastAt:first.createdAt},{peerId:2,name:"Colega fictícia",unread:1,lastMessage:null,lastAt:null}]};
  api.history.mockImplementation(async input=>({messages:input.afterId?[]:[first],hasMore:false}));
  api.send.mockImplementation(async input=>({...first,id:2,senderId:1,senderName:"Você",text:input.text}));
  api.sendFile.mockImplementation(async input=>({...first,id:3,senderId:1,text:input.text || "📎 "+input.name,attachment:{name:input.name,mime:"application/pdf",size:10}}));
  api.sofiaMessages=[];
  api.sofiaAsk.mockImplementation(async input=>{api.sofiaMessages=[...api.sofiaMessages,{id:10,role:"user",text:input.text,createdAt:new Date()},{id:11,role:"assistant",text:"Encontrei 2 pacientes.",createdAt:new Date()}];return {userMessage:api.sofiaMessages[0],assistantMessage:api.sofiaMessages[1]};});
});
afterEach(cleanup);
async function openConversation(name="# equipe") {
  fireEvent.click(screen.getByRole("button",{name:/Abrir ChatMed/}));
  fireEvent.click(screen.getByRole("button",{name:new RegExp(name)}));
  await screen.findByRole("log");
  await waitFor(()=>expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).disabled).toBe(false));
}
describe("janela ChatMed",()=>{
  it("posiciona o sininho ao lado do título, sem barra de configuração",async()=>{
    render(<ChatMed userId={1}/>);
    fireEvent.click(screen.getByRole("button",{name:/Abrir ChatMed/}));
    const title=screen.getByRole("heading",{name:"ChatMed"});
    const bell=screen.getByRole("button",{name:"Avisos do ChatMed"});
    expect(title.parentElement?.contains(bell)).toBe(true);
    expect(bell.textContent).toBe("");
    expect(screen.queryByText(/Avisos do ChatMed ·/)).toBeNull();
    fireEvent.click(bell);
    expect(await screen.findByRole("dialog",{name:"Configurações de avisos do ChatMed"})).toBeTruthy();
    fireEvent.keyDown(document,{key:"Escape"});
    await waitFor(()=>expect(screen.queryByRole("dialog",{name:"Configurações de avisos do ChatMed"})).toBeNull());
    expect(screen.getByRole("heading",{name:"ChatMed"})).toBeTruthy();
  });
  it("mostra a pergunta da SofIA imediatamente enquanto aguarda a resposta e não a duplica",async()=>{
    let answer!:(value:any)=>void;
    api.sofiaAsk.mockImplementation(()=>new Promise(resolve=>{answer=resolve;}));
    render(<ChatMed userId={1}/>);
    fireEvent.click(screen.getByRole("button",{name:/Abrir ChatMed/}));
    fireEvent.click(screen.getByRole("button",{name:/SofIA/}));
    fireEvent.change(screen.getByLabelText("Pergunta para a SofIA"),{target:{value:"olá"}});
    fireEvent.keyDown(screen.getByLabelText("Pergunta para a SofIA"),{key:"Enter"});
    expect(screen.getByRole("log").textContent).toContain("olá");
    expect((screen.getByLabelText("Pergunta para a SofIA") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("status").textContent).toContain("consultando");
    answer({userMessage:{id:20,role:"user",text:"olá",createdAt:new Date()},assistantMessage:{id:21,role:"assistant",text:"Olá! Sou a SofIA.",createdAt:new Date()}});
    await screen.findByText("Olá! Sou a SofIA.");
    expect(screen.getAllByText("olá")).toHaveLength(1);
  });
  it("lista canal, colegas e contador; abre histórico e marca leitura",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    expect(screen.getByRole("log").textContent).toContain("Olá, equipe");
    expect(api.history).toHaveBeenCalledWith({group:"equipe",peerId:null});
    await waitFor(()=>expect(api.read).toHaveBeenCalledWith({group:"equipe",peerId:null,lastSeenId:1}));
    fireEvent.click(screen.getByRole("button",{name:"Voltar às conversas"}));
    fireEvent.click(screen.getByRole("button",{name:/Colega fictícia/}));
    await waitFor(()=>expect(api.history).toHaveBeenCalledWith({group:"equipe",peerId:2}));
    expect(screen.getByText("Conversa privada entre vocês")).toBeTruthy();
  });
  it("envia texto literal, não interpreta HTML e mantém texto após falha com reenvio idempotente",async()=>{
    api.send.mockRejectedValueOnce(new Error("Sem conexão"));
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.change(screen.getByLabelText("Mensagem"),{target:{value:"<script>exemplo</script>"}});
    fireEvent.click(screen.getByRole("button",{name:"Enviar mensagem"}));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("<script>exemplo</script>");
    fireEvent.click(screen.getByRole("button",{name:"Tentar novamente"}));
    await screen.findByText("<script>exemplo</script>");
    expect(api.send.mock.calls[0][0].clientId).toBe(api.send.mock.calls[1][0].clientId);
    expect(screen.getByRole("log").querySelector("script")).toBeNull();
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("");
  });
  it("orienta quem está sem grupo e não consulta histórico",()=>{
    api.data={group:null,threads:[],unread:0};render(<ChatMed userId={1}/>);
    fireEvent.click(screen.getByRole("button",{name:/Abrir ChatMed/}));
    expect(screen.getByText("Seu grupo ainda não foi configurado.")).toBeTruthy();
    expect(api.history).not.toHaveBeenCalled();
  });
  it("oferece conversa particular com a SofIA mesmo sem grupo",async()=>{
    api.data={group:null,threads:[],unread:0};render(<ChatMed userId={1}/>);
    fireEvent.click(screen.getByRole("button",{name:/Abrir ChatMed/}));
    fireEvent.click(screen.getByRole("button",{name:/SofIA/}));
    expect(screen.getByText("Conversa particular · somente leitura")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Pergunta para a SofIA"),{target:{value:"Quantos pacientes estão sem celular?"}});
    fireEvent.click(screen.getByRole("button",{name:"Enviar pergunta"}));
    await waitFor(()=>expect(api.sofiaAsk).toHaveBeenCalledOnce());
    expect(api.sofiaAsk.mock.calls[0][0].text).toBe("Quantos pacientes estão sem celular?");
    expect(api.sofiaAsk.mock.calls[0][0].clientId).toMatch(/^[0-9a-f-]{36}$/i);
  });
  it("une páginas e incrementos sem duplicar mensagens nem mudar a ordem",()=>{
    expect(mergeChatMessages([{...first,id:3},first],[{...first,id:2},first]).map(message=>message.id)).toEqual([1,2,3]);
  });
  it("insere emoji sem enviar e mantém o limite do texto",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.click(screen.getByRole("button",{name:"Escolher emoji"}));
    fireEvent.scroll(screen.getByRole("group",{name:"Lista de emojis"}),{target:{scrollTop:15*36}});
    fireEvent.click(screen.getByRole("button",{name:"Inserir 👍"}));
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("👍");
    expect(api.send).not.toHaveBeenCalled();
  });
  it("envia um PDF sem exigir legenda e mostra o anexo no histórico",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.change(screen.getByLabelText("Selecionar anexo"),{target:{files:[new File(["%PDF-1.4"],"fixture.pdf",{type:"application/pdf"})]}});
    fireEvent.click(screen.getByRole("button",{name:"Enviar mensagem"}));
    await waitFor(()=>expect(api.sendFile).toHaveBeenCalledOnce());
    expect(api.sendFile.mock.calls[0][0]).toMatchObject({group:"equipe",peerId:null,name:"fixture.pdf",text:"",base64:btoa("%PDF-1.4")});
    expect(await screen.findByRole("button",{name:"Baixar"})).toBeTruthy();
    expect(api.send).not.toHaveBeenCalled();
  });
  it("rejeita executável antes de transmitir e permite remover a seleção",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.change(screen.getByLabelText("Selecionar anexo"),{target:{files:[new File(["fixture"],"fixture.exe")]}});
    expect(screen.getByRole("alert").textContent).toContain("Este tipo de arquivo não é suportado. Envie somente imagens, textos e documentos.");
    expect(api.sendFile).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Selecionar anexo"),{target:{files:[new File(["%PDF-1.4"],"fixture.pdf")]}});
    fireEvent.click(screen.getByRole("button",{name:"Remover anexo"}));
    expect(screen.queryByText(/fixture.pdf/)).toBeNull();
  });

  it("busca imagem pela conversa autenticada e revoga a prévia ao fechar",async()=>{
    const revoke=vi.fn();
    Object.defineProperty(URL,"createObjectURL",{configurable:true,value:vi.fn(()=>"blob:synthetic-preview")});
    Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:revoke});
    api.history.mockResolvedValue({messages:[{...first,attachment:{name:"fixture.png",mime:"image/png",size:3}}],hasMore:false});
    api.attachment.mockResolvedValue({name:"fixture.png",mime:"image/png",size:3,base64:"YWJj"});
    const view=render(<ChatMed userId={1}/>);await openConversation();
    expect(api.attachment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Ver imagem"}));
    expect(await screen.findByAltText("fixture.png")).toBeTruthy();
    expect(api.attachment).toHaveBeenCalledWith({group:"equipe",peerId:null,messageId:1});
    view.unmount();expect(revoke).toHaveBeenCalledWith("blob:synthetic-preview");
  });

  it("seleciona integrante com @ e envia a menção estruturada",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.change(screen.getByLabelText("Mensagem"),{target:{value:"@co",selectionStart:3}});
    fireEvent.click(await screen.findByRole("option",{name:/Colega fictícia/}));
    expect(api.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Enviar mensagem"}));
    await waitFor(()=>expect(api.send).toHaveBeenCalledOnce());
    expect(api.send.mock.calls[0][0]).toMatchObject({text:"@Colega fictícia",mentions:[{userId:2,start:0,end:16}]});
  });
  it("oferece @SofIA no grupo como gatilho literal, sem fingir que é um usuário",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.change(screen.getByLabelText("Mensagem"),{target:{value:"@sof",selectionStart:4}});
    fireEvent.click(await screen.findByRole("option",{name:/SofIA/}));
    fireEvent.change(screen.getByLabelText("Mensagem"),{target:{value:"@SofIA quantos pacientes há?",selectionStart:29}});
    fireEvent.click(screen.getByRole("button",{name:"Enviar mensagem"}));
    await waitFor(()=>expect(api.send).toHaveBeenCalledOnce());
    expect(api.send.mock.calls[0][0]).toMatchObject({text:"@SofIA quantos pacientes há?"});
    expect(api.send.mock.calls[0][0].mentions).toBeUndefined();
  });
  it("fecha sugestões sem enviar e não oferece menções no particular",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.change(screen.getByLabelText("Mensagem"),{target:{value:"@",selectionStart:1}});
    expect(await screen.findByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Mensagem"),{key:"Escape"});
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(api.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Voltar às conversas"}));
    fireEvent.click(screen.getByRole("button",{name:/Colega fictícia/}));
    await screen.findByText("Conversa privada entre vocês");
    expect(screen.queryByRole("button",{name:"Marcar pessoa"})).toBeNull();
  });
  it.each([
    ["😀",48],["👍🏽",48],["👩‍⚕️",48],["🇧🇷",48],["❤️ 😊",32],["👍👍👍👍",32],["Olá 😊",null],["123",null],
  ] as const)("dimensiona emojis na mensagem %s sem aumentar texto comum",async(text,size)=>{
    api.history.mockResolvedValue({messages:[{...first,text}],hasMore:false});
    render(<ChatMed userId={1}/>);await openConversation();
    const message=screen.getByText(text);
    expect(message.style.fontSize).toBe(size===null?"":size+"px");
    expect(message.textContent).toBe(text);
  });
});
