import { sofiaPlanJsonSchema, rawSofiaPlanSchema, type RawSofiaPlan } from "./sofiaPlan";

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

Entidades: patients (pacientes) ou contacts (agenda/contatos).
Campos de patients: name, record_number, cpf, address, district, city, state, email, mobile, phone, fax, occupation, referred_by, birth_date, registration_date.
Campos de contacts: name, email, phone, category, occupation, created_at.
Operadores: contains_any (um dos valores), equals, present, absent, this_month.
value_tokens é uma lista de valores; cada valor é uma lista de tokens que devem ser unidos por espaço. Exemplo: cidade $V1 $V2 => [["$V1","$V2"]]. Nome $V1 ou $V2 => [["$V1"],["$V2"]].
present, absent e this_month sempre usam value_tokens vazio.
Pedidos para criar, editar ou excluir usam unsupported/write_operation. Agendamento usa unsupported/scheduling. Orientação médica usa unsupported/medical_advice. Fora de pacientes/contatos usa unsupported/outside_scope.
Se a entidade realmente não puder ser determinada, use clarify/ambiguous_entity. Consultas sem filtro são válidas quando o usuário pede todos ou uma contagem.

Plano anterior: ${previous}
Pergunta atual anonimizada: ${question}`.trim();}

async function requestGemini(input:string,signal:AbortSignal) {
  const key=process.env.GEMINI_API_KEY?.trim();
  if(!key)throw new Error("SOFIA_GEMINI_KEY_MISSING");
  const response=await fetch(ENDPOINT,{
    method:"POST",signal,
    headers:{"content-type":"application/json","x-goog-api-key":key},
    body:JSON.stringify({
      model:process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
      input,
      store:false,
      generation_config:{temperature:0,max_output_tokens:1200,thinking_level:"minimal"},
      response_format:{type:"text",mime_type:"application/json",schema:sofiaPlanJsonSchema},
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
  return rawSofiaPlanSchema.parse(JSON.parse(text));
}

export async function createSofiaPlan(redactedQuestion:string,redactedPrevious:string):Promise<RawSofiaPlan> {
  if(!sofiaEnabled())throw new Error("SOFIA_DISABLED");
  const input=prompt(redactedQuestion,redactedPrevious);
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20_000);
    try{return await requestGemini(input,controller.signal);}
    catch(error){if(attempt || !(error as any)?.retryable)throw error;}
    finally{clearTimeout(timer);}
  }
  throw new Error("SOFIA_GEMINI_REQUEST_FAILED");
}

