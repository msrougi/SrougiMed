import { rawSofiaPlanSchema, type RawSofiaPlan } from "./sofiaPlan";

const ENDPOINT="https://generativelanguage.googleapis.com/v1beta/interactions";

export function sofiaEnabled(){return process.env.SOFIA_ENABLED?.toLocaleLowerCase()!=="false";}

function outputText(value:unknown):string|null {
  if(!value || typeof value!=="object")return null;
  const object=value as Record<string,unknown>;
  if(typeof object.output_text==="string")return object.output_text;
  if(typeof object.outputText==="string")return object.outputText;
  if(Array.isArray(object.steps)){
    for(let index=object.steps.length-1;index>=0;index--){
      const step=object.steps[index] as Record<string,unknown>;
      if(step?.type!=="model_output" || !Array.isArray(step.content))continue;
      const text=step.content.map(item=>typeof item==="object" && item && typeof (item as any).text==="string"?(item as any).text:"").join("");
      if(text)return text;
    }
  }
  for(const nested of Object.values(object)){
    const found=outputText(nested);if(found)return found;
  }
  return null;
}

function prompt(question:string,previous:string){return `
Você é o planejador de consultas SOMENTE LEITURA da SofIA. Recebe texto em português com valores privados substituídos por tokens $Vn/$Pn.
Nunca invente valores, nunca remova o cifrão e use somente tokens existentes no texto ou no plano anterior.
Retorne o plano COMPLETO da nova consulta, incorporando o plano anterior quando a pergunta for uma continuação.
Retorne SOMENTE um objeto JSON válido, sem markdown, comentários ou texto adicional.
O objeto deve ter EXATAMENTE estas chaves, inclusive para ações clarify e unsupported:
{"action":"query","entity":"patients","filters":[],"sort":"name_asc","output":"count","limit":20,"reason":"none"}
action: query, clarify, unsupported ou chat. sort: name_asc, name_desc, newest ou oldest.
output: list, count ou count_and_list. limit: inteiro de 1 a 50 (padrão 20).
reason: none, ambiguous_entity, missing_filter, medical_advice, write_operation, scheduling ou outside_scope.
Cada filtro tem EXATAMENTE {"field":"email","operator":"present","value_tokens":[]}.
Use reason=none para query. Em clarify/unsupported mantenha filters vazio e os demais campos com valores válidos.
Você também conversa naturalmente em português: responda cordialmente a saudações, perguntas sobre você, suas capacidades e dúvidas gerais que puder esclarecer com segurança.
Para conversa sem consulta use action=chat, reason=none, filters=[] e acrescente reply com a resposta (máximo 1000 caracteres). Não inclua tokens privados em reply, não invente dados de pacientes, resultados, ações realizadas ou informações atuais que não possui. Se houver tokens que impeçam entender uma pergunta geral, peça uma explicação sem solicitar dados pessoais.

Entidades: patients (pacientes) ou contacts (agenda/contatos).
Campos de patients: name, record_number, cpf, address, district, city, state, email, mobile, phone, fax, occupation, referred_by, birth_date, registration_date.
Campos de contacts: name, email, phone, category, occupation, created_at.
Operadores: contains_any (um dos valores), equals, present, absent, this_month.
value_tokens é uma lista de valores; cada valor é uma lista de tokens que devem ser unidos por espaço. Exemplo: cidade $V1 $V2 => [["$V1","$V2"]]. Nome $V1 ou $V2 => [["$V1"],["$V2"]].
present, absent e this_month sempre usam value_tokens vazio.
Pedidos para criar, editar ou excluir usam unsupported/write_operation. Agendamento usa unsupported/scheduling. Orientação médica usa unsupported/medical_advice. Nunca use chat para contornar essas restrições.
Se a entidade realmente não puder ser determinada, use clarify/ambiguous_entity. Consultas sem filtro são válidas quando o usuário pede todos ou uma contagem.

Plano anterior: ${previous}
Pergunta atual anonimizada: ${question}`.trim();}

async function requestGemini(input:string,model:string,signal:AbortSignal) {
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key)throw new Error("SOFIA_GEMINI_KEY_MISSING");
  const response=await fetch(ENDPOINT,{
    method:"POST",signal,
    headers:{"content-type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({
      model,
      input,
      store:false,
    }),
  });
  if(!response.ok){
    const retryable=response.status===429 || response.status>=500;
    const status=response.status;
    await response.body?.cancel().catch(()=>undefined);
    throw Object.assign(new Error(`SOFIA_GEMINI_REQUEST_FAILED_${status}`),{retryable});
  }
  const data=await response.json();
  const text=outputText(data);
  if(!text)throw new Error("SOFIA_GEMINI_EMPTY_RESPONSE");
  const json=text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  return rawSofiaPlanSchema.parse(JSON.parse(json));
}

export async function createSofiaPlan(redactedQuestion:string,redactedPrevious:string):Promise<RawSofiaPlan> {
  if(!sofiaEnabled())throw new Error("SOFIA_DISABLED");
  const input=prompt(redactedQuestion,redactedPrevious);
  const models=Array.from(new Set([process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash","gemini-3.5-flash-lite"]));
  for(let attempt=0;attempt<models.length;attempt++){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12_000);
    try{return await requestGemini(input,models[attempt],controller.signal);}
    catch(error){if(attempt===models.length-1 || (!(error as any)?.retryable && !controller.signal.aborted))throw error;}
    finally{clearTimeout(timer);}
  }
  throw new Error("SOFIA_GEMINI_REQUEST_FAILED");
}

