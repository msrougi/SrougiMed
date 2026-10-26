import type { SofiaQueryPlan } from "./sofiaPlan";

export type SofiaTokenMap = Map<string,string>;

// Only language and query vocabulary is allowed to leave the server. Every
// possible patient/contact value becomes an opaque token first.
const PUBLIC_WORDS = new Set(`
  a à agora ainda algum alguma alguns algumas alfabetica alfabeticamente alfabética
  apenas as às buscar busque cadastrada cadastrado cadastradas cadastrados cadastro
  canal celular celulares cidade cidades com contato contatos conte contém da das de
  dele deles dessas desse desses desta destas deste destes do dos e é email emails e-mail e-mails fax em
  encontre estão este estes eu grupo há hoje janeiro fevereiro março abril maio junho
  julho agosto setembro outubro novembro dezembro lista listar liste mas mês minha
  mostre nao não nome nomes no nos nossa nossas nosso nossos o os ou ordem para paciente
  pacientes pelo por primeiro prontuario prontuário quais quantas quantos que quem sem
  somente telefone telefones tem tenham tenha todos todas neste nesta últimos ultimos
  anterior anteriores resultado resultados agenda profissão profissao categoria estado
  uf mora moram residente residentes fica ficam registro registrados registradas
  novo novos nova novas mais menos recente recentes antigo antigos contar total desses
  filtrar filtre mantenha mesmos mesmas também tambem só apenas particular privado
  oi ola olá bom boa dia tarde noite tudo bem obrigado obrigada valeu voce você esta
  está como pode posso podes podemos ajudar ajuda funciona funcionar fazer faz faze
  consegue conseguir sou ser sofiA assistente explicar explique entende entendi
  duvida dúvida duvidas dúvidas por favor preciso quero gostaria saber conversar
  capacidades funcionalidades sistema srougimed chatmed inteligencia inteligência
  artificial saudacao saudação saudacoes saudações gentil conversar conversa
`.trim().split(/\s+/).map(word => normalize(word)));

function normalize(value:string) {
  return value.normalize("NFD").replace(new RegExp("\\p{M}","gu"), "").toLocaleLowerCase("pt-BR");
}

function tokenParts(value:string) {
  return value.match(new RegExp("[\\p{L}\\p{M}\\p{N}@._+\\-]+|[^\\p{L}\\p{M}\\p{N}@._+\\-]+","gu")) || [];
}

export function redactQuestion(question:string, map:SofiaTokenMap = new Map()) {
  let index=1;
  const existing=new Map<string,string>();
  map.forEach((value,token)=>existing.set(value,token));
  const redacted=tokenParts(question).map(part=>{
    if(!new RegExp("[\\p{L}\\p{N}@]","u").test(part))return part;
    if(PUBLIC_WORDS.has(normalize(part)))return part;
    let token=existing.get(part);
    if(!token){
      while(map.has(`$V${index}`))index++;
      token=`$V${index++}`;map.set(token,part);existing.set(part,token);
    }
    return token;
  }).join("");
  return {redacted,map};
}

export function redactPreviousPlan(plan:SofiaQueryPlan|null,map:SofiaTokenMap) {
  if(!plan)return "nenhum";
  let index=1;
  const token=(value:string)=>{
    while(map.has(`$P${index}`))index++;
    const key=`$P${index++}`;map.set(key,value);return key;
  };
  return JSON.stringify({...plan,filters:plan.filters.map(filter=>({...filter,values:filter.values.map(token)}))});
}

export function resolveTokenGroups(groups:string[][],map:SofiaTokenMap) {
  return groups.map(group=>group.map(key=>{
    if(!/^\$[VP]\d+$/.test(key) || !map.has(key))throw new Error("SOFIA_UNKNOWN_VALUE_TOKEN");
    return map.get(key)!;
  }).join(" ").trim()).filter(Boolean);
}

