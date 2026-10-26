import { TRPCError } from "@trpc/server";
import type { Pool,PoolConnection,RowDataPacket,ResultSetHeader } from "mysql2/promise";
import type { SofiaAskResult,SofiaMessage } from "../shared/sofia";
import { createSofiaPlan } from "./sofiaGemini";
import { redactPreviousPlan,redactQuestion } from "./sofiaPrivacy";
import { validateAndResolvePlan,type SofiaFilter,type SofiaQueryPlan } from "./sofiaPlan";

type Db=Pick<Pool,"getConnection">;
type HistoryInput={beforeId?:number;afterId?:number};
type Scope={type:"private"|"group";key:string};
const SOFIA_NAME="SofIA";
const genericFailure="Não consegui concluir essa consulta agora. Tente novamente em alguns instantes.";
const SOFIA_MENTION=new RegExp("(^|\\s)@sofia(?=\\s|[,:;.!?]|$)","iu");
const COMBINING_MARKS=new RegExp("\\p{M}","gu");

const privateMessage=(row:any):SofiaMessage=>({id:Number(row.id),role:row.role,text:row.body,createdAt:row.createdAt});

export function hasSofiaMention(text:string){return SOFIA_MENTION.test(text);}
export function withoutSofiaMention(text:string){return text.replace(SOFIA_MENTION,"$1").replace(/^\s*[,;:.-]\s*/,"").trim();}

export function localRefusal(question:string){
  const value=question.normalize("NFD").replace(COMBINING_MARKS,"").toLocaleLowerCase("pt-BR");
  if(/\b(diagnostico|diagnosticar|tratamento|tratar|remedio|medicamento|dose|sintoma|doenca|cirurgia)\b/.test(value))return "Posso consultar cadastros, mas não forneço orientação médica, diagnóstico ou tratamento.";
  if(/\b(cadastre|cadastrar|crie|criar|altere|alterar|edite|editar|exclua|excluir|apague|apagar)\b/.test(value))return "A SofIA funciona somente para consultas. Ela não cria, altera nem exclui cadastros.";
  if(/\b(agende|agendar|marque|marcar|desmarque|desmarcar|consulta medica)\b/.test(value))return "A SofIA ainda não agenda nem altera consultas. Posso apenas pesquisar pacientes e contatos.";
  return null;
}

export function localSofiaReply(question:string){
  const refused=localRefusal(question);if(refused)return refused;
  const value=question.normalize("NFD").replace(COMBINING_MARKS,"").toLocaleLowerCase("pt-BR").replace(/\btd\b/g,"tudo").trim().replace(/[!?.,;:]+$/g,"").trim();
  if(/^(oi|ola|bom dia|boa tarde|boa noite)([,! ]+sofia)?([,! ]+tudo bem)?$/.test(value) || value==="tudo bem")return "Olá! Sou a SofIA. Tudo bem por aqui! Posso conversar com você e ajudar a buscar pacientes e contatos. O que você precisa?";
  if(/^(obrigado|obrigada|valeu|muito obrigado|muito obrigada)$/.test(value))return "Por nada! Quando precisar, posso ajudar com buscas de pacientes e contatos.";
  return null;
}

function escapeLike(value:string){return value.replace(/[\\%_]/g,character=>"\\"+character);}
const patientColumns:Partial<Record<SofiaFilter["field"],string>>={name:"name",record_number:"code",cpf:"cpf",address:"address",district:"district",city:"city",state:"state",email:"email",mobile:"mobile",phone:"phone",fax:"fax",occupation:"occupation",referred_by:"referredBy",birth_date:"birthDate",registration_date:"registrationDate"};
const contactColumns:Partial<Record<SofiaFilter["field"],string>>={name:"name",email:"email",phone:"phone",occupation:"occupation",category:"category",created_at:"createdAt"};

export function compileSofiaQuery(plan:SofiaQueryPlan){
  const columns=plan.entity==="patients"?patientColumns:contactColumns;
  const where:string[]=[];const params:unknown[]=[];
  for(const filter of plan.filters){
    const storedColumn="`"+columns[filter.field]!+"`";
    const cpf=plan.entity==="patients" && filter.field==="cpf";
    const column=cpf?`REPLACE(REPLACE(REPLACE(${storedColumn},'.',''),'-',''),' ','')`:storedColumn;
    const values=cpf?filter.values.map(value=>value.replace(/[.\-\s]/g,"")):filter.values;
    if(filter.operator==="contains_any"){
      where.push("("+values.map(()=>`${column} LIKE ? ESCAPE '\\\\'`).join(" OR ")+")");
      params.push(...values.map(value=>`%${escapeLike(value)}%`));
    }else if(filter.operator==="equals"){
      where.push("("+values.map(()=>`TRIM(${column})=?`).join(" OR ")+")");params.push(...values);
    }else if(filter.operator==="present")where.push(`NULLIF(TRIM(${column}),'') IS NOT NULL`);
    else if(filter.operator==="absent")where.push(`NULLIF(TRIM(${column}),'') IS NULL`);
    else if(filter.operator==="this_month" && filter.field==="registration_date")where.push(`YEAR(COALESCE(STR_TO_DATE(NULLIF(TRIM(${column}),''),'%d/%m/%Y'),STR_TO_DATE(NULLIF(TRIM(${column}),''),'%Y-%m-%d')))=YEAR(CURRENT_DATE) AND MONTH(COALESCE(STR_TO_DATE(NULLIF(TRIM(${column}),''),'%d/%m/%Y'),STR_TO_DATE(NULLIF(TRIM(${column}),''),'%Y-%m-%d')))=MONTH(CURRENT_DATE)`);
    else if(filter.operator==="this_month")where.push(`YEAR(${column})=YEAR(CURRENT_DATE) AND MONTH(${column})=MONTH(CURRENT_DATE)`);
  }
  const table=plan.entity==="patients"?"patients":"phone_book";
  const select=plan.entity==="patients"?"id,name,code,city,state,phone,mobile,email":"id,name,category,occupation,phone,email";
  const patientDate="COALESCE(STR_TO_DATE(NULLIF(TRIM(registrationDate),''),'%d/%m/%Y'),STR_TO_DATE(NULLIF(TRIM(registrationDate),''),'%Y-%m-%d'))";
  const dateColumn=plan.entity==="patients"?patientDate:"createdAt";
  const order=plan.sort==="name_desc"?"name DESC,id DESC":plan.sort==="newest"?`${dateColumn} DESC,id DESC`:plan.sort==="oldest"?`${dateColumn} ASC,id ASC`:"name ASC,id ASC";
  const clause=where.length?" WHERE "+where.join(" AND "):"";
  return {countSql:`SELECT COUNT(*) AS total FROM ${table}${clause}`,listSql:`SELECT ${select} FROM ${table}${clause} ORDER BY ${order} LIMIT ?`,params,limit:plan.limit};
}

function line(row:any,entity:SofiaQueryPlan["entity"]){
  const pieces=entity==="patients"?[row.code?`prontuário ${row.code}`:"",[row.city,row.state].filter(Boolean).join("/"),row.phone?`telefone ${row.phone}`:"",row.mobile?`celular ${row.mobile}`:"",row.email?`e-mail ${row.email}`:""]:[row.category||row.occupation||"",row.phone?`telefone ${row.phone}`:"",row.email?`e-mail ${row.email}`:""];
  return `• ${row.name}${pieces.filter(Boolean).length?" — "+pieces.filter(Boolean).join(" · "):""}`;
}

function formatResult(plan:SofiaQueryPlan,total:number,rows:any[]){
  const noun=plan.entity==="patients"?(total===1?"paciente":"pacientes"):(total===1?"contato":"contatos");
  if(plan.output==="count")return `Encontrei ${total} ${noun}.`;
  if(!total)return `Não encontrei ${noun} com esses critérios.`;
  const heading=plan.output==="count_and_list"?`Encontrei ${total} ${noun}:`:`Resultados (${total} ${noun}):`;
  const suffix=total>rows.length?`\n\nMostrando ${rows.length} de ${total}. Refine a pergunta para reduzir a lista.`:"";
  return `${heading}\n${rows.map(row=>line(row,plan.entity)).join("\n")}${suffix}`;
}

function fixedAction(action:"clarify"|"unsupported",reason:string){
  if(action==="clarify")return "Você quer pesquisar pacientes ou contatos da agenda?";
  if(reason==="medical_advice")return "Posso consultar cadastros, mas não forneço orientação médica, diagnóstico ou tratamento.";
  if(reason==="write_operation")return "A SofIA funciona somente para consultas. Ela não cria, altera nem exclui cadastros.";
  if(reason==="scheduling")return "A SofIA ainda não agenda nem altera consultas. Posso apenas pesquisar pacientes e contatos.";
  return "Posso ajudar somente com consultas de pacientes e contatos cadastrados.";
}

export class SofiaStore{
  constructor(private pool:Db){}
  private async connection(){try{return await this.pool.getConnection();}catch{throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"SofIA indisponível. Tente novamente."});}}
  private async context(db:PoolConnection,scope:Scope):Promise<SofiaQueryPlan|null>{
    const [rows]=await db.query<RowDataPacket[]>("SELECT planJson FROM sofia_contexts WHERE scopeType=? AND scopeKey=?",[scope.type,scope.key]);
    if(!rows[0])return null;try{return JSON.parse(rows[0].planJson as string);}catch{return null;}
  }
  private async saveContext(db:PoolConnection,scope:Scope,plan:SofiaQueryPlan){
    await db.query(`INSERT INTO sofia_contexts(scopeType,scopeKey,planJson) VALUES(?,?,?) ON DUPLICATE KEY UPDATE planJson=VALUES(planJson),updatedAt=CURRENT_TIMESTAMP(3)`,[scope.type,scope.key,JSON.stringify(plan)]);
  }
  private async answer(scope:Scope,question:string){
    const local=localSofiaReply(question);if(local)return {body:local,plan:null};
    const db=await this.connection();
    try{
      const previous=await this.context(db,scope);const map=new Map<string,string>();
      const previousText=redactPreviousPlan(previous,map);const {redacted}=redactQuestion(question,map);
      const raw=await createSofiaPlan(redacted,previousText);const resolved=validateAndResolvePlan(raw,map);
      if(resolved.action==="chat")return {body:resolved.reply!,plan:null};
      if(!resolved.plan)return {body:fixedAction(resolved.action as "clarify"|"unsupported",resolved.reason),plan:null};
      const query=compileSofiaQuery(resolved.plan);
      const [countRows]=await db.query<RowDataPacket[]>(query.countSql,query.params);const total=Number(countRows[0]?.total || 0);
      let rows:RowDataPacket[]=[];
      if(resolved.plan.output!=="count")([rows]=await db.query<RowDataPacket[]>(query.listSql,[...query.params,query.limit]));
      return {body:formatResult(resolved.plan,total,rows),plan:resolved.plan};
    }finally{db.release();}
  }
  async history(userId:number,input:HistoryInput){
    const db=await this.connection();try{
      const incremental=Boolean(input.afterId),size=50,cursor=input.beforeId??input.afterId;
      const [rows]=await db.query<RowDataPacket[]>(`SELECT id,role,body,createdAt FROM sofia_private_messages WHERE ownerUserId=? ${cursor?`AND id ${incremental?">":"<"} ?`:""} ORDER BY id ${incremental?"ASC":"DESC"} LIMIT ?`,[userId,...(cursor?[cursor]:[]),size+1]);
      const hasMore=rows.length>size,page=rows.slice(0,size);if(!incremental)page.reverse();return {messages:page.map(privateMessage),hasMore};
    }finally{db.release();}
  }
  async askPrivate(userId:number,input:{text:string;clientId:string}):Promise<SofiaAskResult>{
    let db=await this.connection();let userRow:any,existing:any;
    try{
      await db.beginTransaction();
      await db.query(`INSERT IGNORE INTO sofia_private_messages(ownerUserId,role,body,clientId) VALUES(?,'user',?,?)`,[userId,input.text,input.clientId]);
      const [users]=await db.query<RowDataPacket[]>("SELECT id,role,body,createdAt FROM sofia_private_messages WHERE ownerUserId=? AND role='user' AND clientId=? FOR UPDATE",[userId,input.clientId]);userRow=users[0];
      if(!userRow || userRow.body!==input.text)throw new TRPCError({code:"CONFLICT",message:"Reenvio inválido. Atualize a conversa e tente novamente."});
      const [answers]=await db.query<RowDataPacket[]>("SELECT id,role,body,createdAt FROM sofia_private_messages WHERE ownerUserId=? AND role='assistant' AND clientId=?",[userId,input.clientId]);existing=answers[0];
      await db.commit();
    }catch(error){await db.rollback();throw error;}finally{db.release();}
    if(existing)return {userMessage:privateMessage(userRow),assistantMessage:privateMessage(existing)};
    let result:{body:string;plan:SofiaQueryPlan|null};
    try{result=await this.answer({type:"private",key:String(userId)},input.text);}catch(error){console.error("[SofIA]",(error as Error).message?.slice(0,80)||"ERROR");result={body:genericFailure,plan:null};}
    db=await this.connection();try{
      await db.beginTransaction();if(result.plan)await this.saveContext(db,{type:"private",key:String(userId)},result.plan);
      await db.query(`INSERT IGNORE INTO sofia_private_messages(ownerUserId,role,body,clientId) VALUES(?,'assistant',?,?)`,[userId,result.body,input.clientId]);
      const [answers]=await db.query<RowDataPacket[]>("SELECT id,role,body,createdAt FROM sofia_private_messages WHERE ownerUserId=? AND role='assistant' AND clientId=?",[userId,input.clientId]);
      await db.commit();return {userMessage:privateMessage(userRow),assistantMessage:privateMessage(answers[0])};
    }catch(error){await db.rollback();throw error;}finally{db.release();}
  }
  async answerGroup(userId:number,group:string,question:string,requestMessageId:number){
    const clientId=`sofia-${requestMessageId}`;let db=await this.connection();
    try{
      const [source]=await db.query<RowDataPacket[]>(`SELECT m.id FROM chatmed_messages m JOIN chatmed_conversations c ON c.id=m.conversationId JOIN users u ON u.id=? WHERE m.id=? AND m.senderId=? AND c.groupName=? AND c.memberA=0 AND c.memberB=0 AND u.chatGroup=c.groupName`,[userId,requestMessageId,userId,group]);
      if(!source[0])throw new TRPCError({code:"FORBIDDEN",message:"Canal indisponível."});
      const [old]=await db.query<RowDataPacket[]>("SELECT id FROM chatmed_messages WHERE senderId=0 AND clientId=?",[clientId]);if(old[0])return;
    }finally{db.release();}
    let result:{body:string;plan:SofiaQueryPlan|null};
    try{result=await this.answer({type:"group",key:group},question || "Quais consultas você pode fazer?");}catch(error){console.error("[SofIA]",(error as Error).message?.slice(0,80)||"ERROR");result={body:genericFailure,plan:null};}
    db=await this.connection();try{
      await db.beginTransaction();
      const [conversation]=await db.query<RowDataPacket[]>("SELECT id FROM chatmed_conversations WHERE groupName=? AND memberA=0 AND memberB=0 FOR UPDATE",[group]);
      if(!conversation[0])throw new Error("SOFIA_GROUP_NOT_FOUND");
      if(result.plan)await this.saveContext(db,{type:"group",key:group},result.plan);
      const [inserted]=await db.query<ResultSetHeader>(`INSERT IGNORE INTO chatmed_messages(conversationId,senderId,senderName,body,clientId) VALUES(?,0,?,?,?)`,[conversation[0].id,SOFIA_NAME,result.body,clientId]);
      if(inserted.affectedRows===1)await db.query("INSERT IGNORE INTO chatmed_push_events(messageId) VALUES(?)",[inserted.insertId]);
      await db.commit();
    }catch(error){await db.rollback();throw error;}finally{db.release();}
  }
}

