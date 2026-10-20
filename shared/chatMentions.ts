import { z } from "zod";
export const chatMentionInputSchema=z.object({userId:z.number().int().positive(),start:z.number().int().min(0).max(3999),end:z.number().int().min(1).max(4000)}).strict().refine(value=>value.end>value.start,"Menção inválida");
export const chatMentionListSchema=z.array(chatMentionInputSchema).max(20,"Use até 20 menções por mensagem");
export type ChatMentionInput=z.infer<typeof chatMentionInputSchema>;
export type ChatMention=ChatMentionInput & {name:string};
export type ChatMentionMember={id:number;name:string;username:string|null};
export function mentionBoundary(text:string,start:number,end:number) {
  return (start===0 || /[\s([{]/.test(text[start-1])) && (end===text.length || /[\s.,!?;:)\]}]/.test(text[end]));
}
export function findMentionQuery(text:string,caret:number) {
  const match=text.slice(0,caret).match(/(?:^|[\s(])@([^\s@]{0,60})$/u);
  return match?{start:caret-match[1].length-1,end:caret,query:match[1]}:null;
}
export function filterMentionMembers(members:ChatMentionMember[],query:string) {
  const key=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR");
  return members.filter(member=>key(member.name+" "+(member.username||"")).includes(key(query)));
}
export function rebaseMentions(previous:string,next:string,ranges:ChatMentionInput[]) {
  let first=0,last=0;
  while(first<previous.length && first<next.length && previous[first]===next[first])first++;
  while(last<previous.length-first && last<next.length-first && previous[previous.length-1-last]===next[next.length-1-last])last++;
  const oldEnd=previous.length-last,delta=next.length-previous.length;
  return ranges.flatMap(range=>{
    let updated:ChatMentionInput;
    if(range.end<=first)updated=range;
    else if(range.start>=oldEnd)updated={...range,start:range.start+delta,end:range.end+delta};
    else return [];
    return next.slice(updated.start,updated.end)===previous.slice(range.start,range.end)?[updated]:[];
  });
}
export function submittedMentions(text:string,ranges:ChatMentionInput[]) {
  const offset=text.length-text.trimStart().length,trimmed=text.trim();
  return ranges.map(range=>({...range,start:range.start-offset,end:range.end-offset}))
    .filter(range=>range.start>=0 && range.end<=trimmed.length && mentionBoundary(trimmed,range.start,range.end))
    .sort((a,b)=>a.start-b.start);
}
