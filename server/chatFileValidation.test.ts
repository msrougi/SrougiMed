import { describe,it,expect,vi } from "vitest";
import { decodeChatFile } from "./chatFileValidation";
import { chatFilePayloadSchema, CHAT_FILE_MAX_BYTES, chatFileError } from "../shared/chatAttachments";
const file=(name:string,data:Buffer|string)=>({name,base64:Buffer.from(data).toString("base64")});
describe("validação de anexos do ChatMed",()=>{
  it("define MIME no servidor e valida assinatura de imagem/PDF",()=>{
    expect(decodeChatFile(file("fixture.pdf","%PDF-1.4 fixture")).meta.mime).toBe("application/pdf");
    expect(decodeChatFile(file("fixture.png",Buffer.from("89504e470d0a1a0a00000000","hex"))).meta.mime).toBe("image/png");
    expect(()=>decodeChatFile(file("fixture.jpg","%PDF-1.4 fixture"))).toThrow("Arquivo inválido");
    expect(chatFilePayloadSchema.safeParse({...file("f.pdf","%PDF-"),clientId:"d14d7929-51ee-4a63-9479-1eadf8070666",mime:"text/html"}).success).toBe(false);
  });
  it("aceita os contêineres comuns de Office e impede executáveis e SVG",()=>{
    for(const ext of ["doc","xls","ppt"])expect(decodeChatFile(file("fixture."+ext,Buffer.from("d0cf11e0a1b11ae10000","hex"))).meta.size).toBe(10);
    for(const ext of ["docx","xlsx","pptx","odt","ods","odp"])expect(decodeChatFile(file("fixture."+ext,Buffer.from("504b03040000","hex"))).meta.name).toBe("fixture."+ext);
    for(const ext of ["exe","html","svg","js","docm"])expect(chatFileError({name:"fixture."+ext,size:10})).toContain("Formato");
  });
  it("limita tamanho, rejeita base64 inválido e limpa controles/caminhos do nome",()=>{
    expect(()=>decodeChatFile({name:"f.pdf",base64:"invalid!"})).toThrow();
    expect(()=>decodeChatFile(file("f.pdf",Buffer.alloc(CHAT_FILE_MAX_BYTES+1)))).toThrow("5 MB");
    expect(decodeChatFile(file("../fixture.pdf","%PDF-")).meta.name).toBe(".._fixture.pdf");
    expect(chatFileError({name:"empty.pdf",size:0})).toContain("vazio");
  });
});
const db=vi.hoisted(()=>({getDb:vi.fn()}));
vi.mock("./db",()=>db);
import {appRouter} from "./routers";
it("upload e download são negados sem sessão antes de consultar o banco",async()=>{
  const caller=appRouter.createCaller({user:null,req:{headers:{}},res:{}} as any);
  await expect(caller.chatMed.sendFile({group:"fixture",peerId:null,...file("f.pdf","%PDF-"),text:"",clientId:"d14d7929-51ee-4a63-9479-1eadf8070666"})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  await expect(caller.chatMed.attachment({group:"fixture",peerId:null,messageId:1})).rejects.toMatchObject({code:"UNAUTHORIZED"});
  expect(db.getDb).not.toHaveBeenCalled();
});
