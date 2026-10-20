import { beforeAll,afterAll,beforeEach,describe,it,expect } from "vitest";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { prepareChatMed } from "./prepareChatMed";
import { ChatMedStore } from "./chatMedStore";
const url=process.env.SROUGI_CHAT_TEST_DATABASE_URL;
if (url) {
  const parsed=new URL(url);
  if (!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname) || !/^\/srougi_test_chat[a-z0-9_]*$/.test(parsed.pathname)) throw new Error("ChatMed tests require an isolated localhost database");
}
describe.skipIf(!url)("ChatMed — MySQL isolado com dados fictícios",()=>{
  let pool:mysql.Pool;
  let store:ChatMedStore;
  const group={group:"equipe a",peerId:null};
  const dm={group:"equipe a",peerId:2};
  const send=(userId:number,thread=group,text="Mensagem fictícia",clientId=randomUUID())=>store.send(userId,{...thread,text,clientId});
  beforeAll(async()=>{
    pool=mysql.createPool(url!);store=new ChatMedStore(pool);
    await pool.query("CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY,name TEXT,username VARCHAR(100)) ENGINE=InnoDB");
    const connection=await pool.getConnection();
    try { await prepareChatMed(connection);await prepareChatMed(connection); } finally {connection.release();}
  });
  beforeEach(async()=>{
    for(const table of ["chatmed_attachments","chatmed_reads","chatmed_messages","chatmed_conversations","users"])await pool.query(`DELETE FROM ${table}`);
    await pool.query("INSERT INTO users(id,name,username,chatGroup) VALUES (1,'Fixture A','a','equipe a'),(2,'Fixture B','b','equipe a'),(3,'Fixture C','c','equipe a'),(4,'Fixture D','d','equipe b'),(5,'Sem grupo','e',NULL)");
  });
  afterAll(async()=>{await pool?.end();});
  it("lista canal e somente colegas do mesmo grupo, sem dados de autenticação",async()=>{
    const list=await store.threads(1);
    expect(list.group).toBe("equipe a");expect(list.threads.map(x=>x.peerId)).toEqual([null,2,3]);
    expect(await store.threads(5)).toEqual({group:null,threads:[],unread:0});
    expect(JSON.stringify(list)).not.toMatch(/password|Fixture D|username/);
  });
  it("canal coletivo entrega a todos do grupo, mas não a outra equipe",async()=>{
    const sent=await send(1);
    expect((await store.history(2,group)).messages[0].id).toBe(sent.id);
    expect((await store.history(3,group)).messages[0].text).toBe("Mensagem fictícia");
    expect((await store.threads(1)).unread).toBe(0);expect((await store.threads(2)).unread).toBe(1);
    await expect(store.history(4,group)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(store.send(4,{...group,text:"Não pode",clientId:randomUUID()})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("conversa individual só aparece para os dois participantes, inclusive administradores sem atalho",async()=>{
    const sent=await send(1,dm);
    expect((await store.history(2,{...dm,peerId:1})).messages[0].id).toBe(sent.id);
    expect((await store.history(3,{...dm,peerId:2})).messages).toEqual([]);
    expect((await store.threads(3)).unread).toBe(0);
    expect((await store.threads(2)).threads.find(t=>t.peerId===1)?.unread).toBe(1);
    await expect(store.history(1,{...dm,peerId:4})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(store.history(1,{...dm,peerId:1})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("marca só a conversa do próprio usuário e não reduz o cursor de leitura",async()=>{
    const first=await send(1);const second=await send(1);
    await store.read(2,{...group,lastSeenId:second.id});await store.read(2,{...group,lastSeenId:first.id});
    expect((await store.threads(2)).unread).toBe(0);expect((await store.threads(3)).unread).toBe(2);
    const privateMessage=await send(1,dm);
    await expect(store.read(3,{...group,lastSeenId:privateMessage.id})).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await store.threads(3)).unread).toBe(2);
  });
  it("reenvio idêntico e concorrente não duplica, mas mudar o corpo ou a conversa rejeita",async()=>{
    const key=randomUUID();const sent=await Promise.all([send(1,dm,"Olá",key),send(1,dm,"Olá",key)]);
    expect(sent[0].id).toBe(sent[1].id);expect((await store.history(2,{...dm,peerId:1})).messages).toHaveLength(1);
    await expect(send(1,dm,"Alterada",key)).rejects.toMatchObject({code:"CONFLICT"});
    await expect(send(1,group,"Olá",key)).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("mudança de grupo e remoção de usuário revogam o acesso imediatamente",async()=>{
    await send(1,dm);
    await pool.query("UPDATE users SET chatGroup='equipe b' WHERE id=2");
    await expect(store.history(2,{...dm,peerId:1})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(store.history(1,dm)).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await store.threads(1)).threads.map(t=>t.peerId)).toEqual([null,3]);
    await pool.query("DELETE FROM users WHERE id=1");
    await expect(store.threads(1)).rejects.toMatchObject({code:"UNAUTHORIZED"});
  });
  it("histórico persiste entre conexões, pagina sem duplicar e recebe incrementos em ordem",async()=>{
    for(let i=0;i<57;i++)await send(1,group,`Mensagem ${i}`);
    const latest=await new ChatMedStore(pool).history(2,group);
    expect(latest.messages).toHaveLength(50);expect(latest.hasMore).toBe(true);
    const older=await store.history(2,{...group,beforeId:latest.messages[0].id});
    expect(older.messages).toHaveLength(7);expect(older.hasMore).toBe(false);
    const all=[...older.messages,...latest.messages];expect(new Set(all.map(m=>m.id)).size).toBe(57);
    const after=latest.messages.at(-1)!.id;await send(1,group,"Nova");
    const incoming=await store.history(2,{...group,afterId:after});
    expect(incoming.messages.map(m=>m.text)).toEqual(["Nova"]);
  });
  const payload=(name="fixture.pdf")=>({name,base64:Buffer.from("%PDF-1.4 synthetic fixture").toString("base64"),text:"Arquivo de teste",clientId:randomUUID()});
  it("preserva anexo após reconectar e entrega bytes somente aos participantes",async()=>{
    const file=payload();const sent=await store.sendFile(1,{...dm,...file});
    expect(sent.attachment).toMatchObject({name:"fixture.pdf",mime:"application/pdf"});
    const history=await new ChatMedStore(pool).history(2,{...dm,peerId:1});
    expect(history.messages[0].attachment?.name).toBe("fixture.pdf");
    expect(JSON.stringify(history)).not.toContain("base64");
    const downloaded=await store.attachment(2,{...dm,peerId:1,messageId:sent.id});
    expect(downloaded.base64).toBe(file.base64);
    await expect(store.attachment(3,{...dm,peerId:2,messageId:sent.id})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(store.attachment(4,{...dm,peerId:1,messageId:sent.id})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("anexo do canal fica disponível ao grupo, sem aceitar ID de arquivo privado",async()=>{
    const sent=await store.sendFile(1,{...group,...payload()});
    expect((await store.attachment(3,{...group,messageId:sent.id})).name).toBe("fixture.pdf");
    const privateFile=await store.sendFile(1,{...dm,...payload()});
    await expect(store.attachment(3,{...group,messageId:privateFile.id})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("mudança de grupo revoga também o download",async()=>{
    const sent=await store.sendFile(1,{...dm,...payload()});
    await pool.query("UPDATE users SET chatGroup='equipe b' WHERE id=2");
    await expect(store.attachment(2,{...dm,peerId:1,messageId:sent.id})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("reenvio concorrente de arquivo não duplica e não troca seus bytes",async()=>{
    const file={...dm,...payload()};
    const sent=await Promise.all([store.sendFile(1,file),store.sendFile(1,file)]);
    expect(sent[0].id).toBe(sent[1].id);
    const [count]=await pool.query<any[]>("SELECT COUNT(*) AS total FROM chatmed_attachments");expect(Number(count[0].total)).toBe(1);
    await expect(store.sendFile(1,{...file,base64:Buffer.from("%PDF-1.4 other fixture").toString("base64")})).rejects.toMatchObject({code:"CONFLICT"});
  });
  it("não converte mensagem de texto existente em arquivo com o mesmo identificador",async()=>{
    const file=payload();await send(1,dm,file.text,file.clientId);
    await expect(store.sendFile(1,{...dm,...file})).rejects.toMatchObject({code:"CONFLICT"});
    const [count]=await pool.query<any[]>("SELECT COUNT(*) AS total FROM chatmed_attachments");expect(Number(count[0].total)).toBe(0);
  });
  it("conteúdo inválido não cria mensagem nem anexo e emoji persiste",async()=>{
    await expect(store.sendFile(1,{...dm,...payload("fixture.png")})).rejects.toMatchObject({code:"BAD_REQUEST"});
    expect((await store.history(1,dm)).messages).toHaveLength(0);
    await send(1,group,"Olá! 😊 👍 ❤️");expect((await store.history(2,group)).messages[0].text).toBe("Olá! 😊 👍 ❤️");
  });

});
