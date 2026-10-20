import {describe,it,expect} from "vitest";
import {findMentionQuery,filterMentionMembers,rebaseMentions,submittedMentions,chatMentionListSchema} from "../shared/chatMentions";
describe("edição de menções",()=>{
it("reconhece @ no cursor e não e-mail",()=>{
expect(findMentionQuery("Olá @Ro",7)).toEqual({start:4,end:7,query:"Ro"});
expect(findMentionQuery("a@b.com",7)).toBeNull();
expect(filterMentionMembers([{id:1,name:"Rô",username:"rose"}],"ro")).toHaveLength(1);
});
it("ajusta posição ao inserir antes e descarta marcação editada",()=>{
const spans=[{userId:2,start:0,end:4}];
expect(rebaseMentions("@Ana oi","Olá @Ana oi",spans)).toEqual([{userId:2,start:4,end:8}]);
expect(rebaseMentions("@Ana oi","@Anx oi",spans)).toEqual([]);
expect(submittedMentions("  @Ana  ",[{userId:2,start:2,end:6}])).toEqual(spans);
});
it("limita quantidade e rejeita intervalos inválidos",()=>{
expect(chatMentionListSchema.safeParse([{userId:2,start:4,end:2}]).success).toBe(false);
expect(chatMentionListSchema.safeParse(Array.from({length:21},()=>({userId:2,start:0,end:4}))).success).toBe(false);
});
});
