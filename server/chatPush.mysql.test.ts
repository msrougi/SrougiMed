import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from "vitest";
import mysql from "mysql2/promise";
import {createECDH,randomUUID} from "node:crypto";
import jwt from "jsonwebtoken";
const fixture=vi.hoisted(()=>({pool:null as any,send:vi.fn()}));
vi.mock("./db",()=>({getDb:async()=>({$client:{promise:()=>fixture.pool}})}));
vi.mock("web-push",()=>({default:{sendNotification:fixture.send}}));
vi.mock("./_core/env",()=>({ENV:{cookieSecret:"synthetic-chat-push-session-key",isProduction:false}}));
import {prepareChatMed} from "./prepareChatMed";
import {ChatMedStore} from "./chatMedStore";
import {appRouter} from "./routers";
import {dispatchChatPush} from "./chatPush";
const url=process.env.SROUGI_PUSH_TEST_DATABASE_URL;
if(url){const parsed=new URL(url);if(!["localhost","127.0.0.1"].includes(parsed.hostname) || parsed.pathname!=="/srougi_test_push")throw Error("Isolated push database required");}
const users=[1,2,3,4].map(id=>({id,username:`fixture${id}`,name:`Fixture ${id}`,password:"synthetic-hash",email:`fixture${id}@example.invalid`,role:"user"}));
const caller=(id:number,token=jwt.sign({userId:id},"synthetic-chat-push-session-key",{expiresIn:"1h"}))=>appRouter.createCaller({user:users[id-1],req:{headers:{cookie:"app_session_id="+token}},res:{clearCookie:vi.fn(),cookie:vi.fn()}} as any);
const anon=()=>appRouter.createCaller({user:null,req:{headers:{}},res:{}} as any);
function subscription(id:number){const key=createECDH("prime256v1");key.generateKeys();return {endpoint:`https://fcm.googleapis.com/wp/synthetic-${id}`,keys:{p256dh:key.getPublicKey().toString("base64url"),auth:Buffer.alloc(16,1).toString("base64url")},sound:true};}
describe.skipIf(!url)("push ChatMed — MySQL isolado sem envio externo",()=>{
  let pool:mysql.Pool,store:ChatMedStore;
  const group={group:"fixture",peerId:null};
  const send=(peerId:number|null=null,clientId=randomUUID())=>store.send(1,{...group,peerId,text:"CONTEÚDO PRIVADO FICTÍCIO",clientId});
  beforeAll(async()=>{
    pool=mysql.createPool(url!);fixture.pool=pool;store=new ChatMedStore(pool);
    await pool.query("CREATE TABLE IF NOT EXISTS users(id INT PRIMARY KEY,username VARCHAR(100),name VARCHAR(100),email VARCHAR(200),password TEXT,role VARCHAR(20))");
    await pool.query("CREATE TABLE IF NOT EXISTS srougi_trusted_devices(id CHAR(64) PRIMARY KEY,userId INT,accountHash CHAR(64),revoked BOOLEAN,expiresAt DATETIME)");
    const c=await pool.getConnection();try{await prepareChatMed(c);await prepareChatMed(c);}finally{c.release();}
  });
  beforeEach(async()=>{
    for(const [key,value] of Object.entries({JWT_SECRET:"synthetic-chat-push-session-key",SECOND_FACTOR_ENABLED:"false",NATIVE_EMAIL_LOGIN:"false",BIA_DEVICE_ACCESS_ENABLED:"false",CF_ACCESS_ENABLED:"false",OFFICE_ACCESS_POLICY_ENABLED:"false"}))vi.stubEnv(key,value);
    fixture.send.mockReset();fixture.send.mockResolvedValue({statusCode:201});
    for(const table of ["chatmed_push_events","chatmed_push_subscriptions","chatmed_push_deliveries","chatmed_reads","chatmed_messages","chatmed_conversations","srougi_trusted_devices","users"])await pool.query(`DELETE FROM ${table}`);
    for(const user of users)await pool.query("INSERT INTO users(id,username,name,email,password,role,chatGroup) VALUES(?,?,?,?,?,?,?)",[user.id,user.username,user.name,user.email,user.password,user.role,user.id===4?"other":"fixture"]);
  });
  afterAll(async()=>{vi.unstubAllEnvs();await pool?.end();});
  it("exige autenticação e valida o dono da sessão",async()=>{
    await expect(anon().chatAlerts.publicKey()).rejects.toMatchObject({code:"UNAUTHORIZED"});
    await expect(anon().chatAlerts.subscribe(subscription(1))).rejects.toMatchObject({code:"UNAUTHORIZED"});
    const wrong=jwt.sign({userId:2},"synthetic-chat-push-session-key",{expiresIn:"1h"});
    await expect(caller(1,wrong).chatAlerts.subscribe(subscription(1))).rejects.toMatchObject({code:"UNAUTHORIZED"});
  });
  it("entrega particular apenas ao destinatário, sem conteúdo, nome ou grupo no payload",async()=>{
    for(const id of [1,2,3,4])await caller(id).chatAlerts.subscribe(subscription(id));
    await send(2);await dispatchChatPush();
    expect(fixture.send).toHaveBeenCalledTimes(1);
    expect(fixture.send.mock.calls[0][0].endpoint).toContain("synthetic-2");
    expect(fixture.send.mock.calls[0][1]).not.toMatch(/PRIVADO|Fixture|fixture/);
    await dispatchChatPush();expect(fixture.send).toHaveBeenCalledTimes(1);
  });
  it("canal só alerta integrantes atuais, nunca remetente, outra equipe ou mensagem já lida",async()=>{
    for(const id of [1,2,3,4])await caller(id).chatAlerts.subscribe(subscription(id));
    const sent=await send();await store.read(2,{...group,lastSeenId:sent.id});
    await pool.query("UPDATE users SET chatGroup='other' WHERE id=3");
    await dispatchChatPush();expect(fixture.send).not.toHaveBeenCalled();
  });
  it("canal entrega aos outros integrantes e respeita som desligado",async()=>{
    await caller(2).chatAlerts.subscribe({...subscription(2),sound:false});await caller(3).chatAlerts.subscribe(subscription(3));
    await send();await dispatchChatPush();expect(fixture.send).toHaveBeenCalledTimes(2);
    const muted=fixture.send.mock.calls.find(call=>call[0].endpoint.endsWith("synthetic-2"));
    expect(JSON.parse(muted![1]).silent).toBe(true);
  });
  it("reenvio idempotente gera um evento e não duplica avisos",async()=>{
    await caller(2).chatAlerts.subscribe(subscription(2));const clientId=randomUUID();
    await send(2,clientId);await send(2,clientId);await dispatchChatPush();await send(2,clientId);await dispatchChatPush();
    expect(fixture.send).toHaveBeenCalledTimes(1);
  });
  it("sair remove assinatura; mudar senha ou expirar sessão também impede envio",async()=>{
    for(const id of [1,2,3])await caller(id).chatAlerts.subscribe(subscription(id));
    await caller(2).auth.logout();await pool.query("UPDATE users SET password='changed' WHERE id=3");
    await send();await dispatchChatPush();expect(fixture.send).not.toHaveBeenCalled();
    await caller(2).chatAlerts.subscribe(subscription(2));await pool.query("UPDATE chatmed_push_subscriptions SET expiresAt=DATE_SUB(NOW(),INTERVAL 1 SECOND)");
    await send();await dispatchChatPush();expect(fixture.send).not.toHaveBeenCalled();
  });
  it("endpoint vencido é removido e erro temporário tenta novamente sem duplicar sucessos",async()=>{
    await caller(2).chatAlerts.subscribe(subscription(2));await caller(3).chatAlerts.subscribe(subscription(3));
    fixture.send.mockImplementation(async(target:any)=>{if(target.endpoint.endsWith("synthetic-2"))throw {statusCode:503};return {};});
    await send();await dispatchChatPush();expect(fixture.send).toHaveBeenCalledTimes(2);
    fixture.send.mockRejectedValue({statusCode:410});await dispatchChatPush();expect(fixture.send).toHaveBeenCalledTimes(3);
    const [rows]=await pool.query<any[]>("SELECT userId FROM chatmed_push_subscriptions");expect(rows.map(x=>x.userId)).toEqual([3]);
  });
  it("o mesmo navegador troca de conta sem continuar alertando a anterior",async()=>{
    const same=subscription(2);await caller(2).chatAlerts.subscribe(same);await caller(3).chatAlerts.subscribe(same);
    await send(2);await dispatchChatPush();expect(fixture.send).not.toHaveBeenCalled();
    await send(3);await dispatchChatPush();expect(fixture.send).toHaveBeenCalledTimes(1);
  });
});
