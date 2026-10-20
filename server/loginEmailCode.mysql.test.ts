import {beforeAll,beforeEach,afterAll,describe,expect,it,vi} from "vitest";
import mysql from "mysql2/promise";
import {LoginEmailCodeStore,type CodeMail} from "./loginEmailCode";
import {prepareNetworkAccess} from "./prepareNetworkAccess";
const url=process.env.SROUGI_NETWORK_TEST_DATABASE_URL;
if(url){const u=new URL(url);if(!["127.0.0.1","localhost","[::1]"].includes(u.hostname)||!/^\/srougi_test_network[a-z0-9_]*$/.test(u.pathname))throw Error("Network tests require isolated localhost database");}
describe.skipIf(!url)("códigos de e-mail — MySQL isolado",()=>{
  let pool:mysql.Pool,store:LoginEmailCodeStore;
  let mails:CodeMail[]=[];
  const user={id:1,username:"rose",email:"fixture@example.invalid",password:"synthetic-hash"};
  const request=(ip="198.51.100.2",agent="Fixture")=>({headers:{"true-client-ip":ip,"user-agent":agent}} as any);
  beforeAll(async()=>{
    pool=mysql.createPool(url!);
    await pool.query("CREATE TABLE IF NOT EXISTS users(id INT PRIMARY KEY,username VARCHAR(100),name TEXT,email VARCHAR(320),password VARCHAR(255)) ENGINE=InnoDB");
    vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","false");const connection=await pool.getConnection();try{await prepareNetworkAccess(connection);await prepareNetworkAccess(connection);}finally{connection.release();}
  });
  beforeEach(async()=>{
    vi.stubEnv("SECOND_FACTOR_ENABLED","false");vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","true");vi.stubEnv("OFFICE_PUBLIC_IP","198.51.100.1");vi.stubEnv("OFFICE_CLIENT_IP_HEADER","true-client-ip");vi.stubEnv("OFFICE_IP_HEADER_VERIFIED","true");vi.stubEnv("JWT_SECRET","synthetic-network-test-key");
    mails=[];store=new LoginEmailCodeStore(pool,async mail=>{mails.push(mail);});
    await pool.query("DELETE FROM srougi_login_codes");await pool.query("DELETE FROM users");
    await pool.query("INSERT INTO users(id,username,email,password) VALUES(?,?,?,?)",[1,user.username,user.email,user.password]);
  });
  afterAll(async()=>{await pool?.end();vi.unstubAllEnvs();});
  it("guarda apenas hash, entrega por e-mail e consome uma única vez",async()=>{
    const challenge=await store.start(user,request());
    expect(challenge.requiresCode).toBe(true);expect(challenge.emailHint).toBe("f***@example.invalid");
    const [rows]=await pool.query<any[]>("SELECT * FROM srougi_login_codes WHERE id=?",[challenge.challengeId]);
    expect(rows[0].codeHash).not.toBe(mails[0].code);expect(rows[0].codeHash).toHaveLength(64);
    const result=await store.verify(challenge.challengeId,mails[0].code,request());expect(result.user.id).toBe(1);expect(result.proof.emailCodeIp).toBe("198.51.100.2");
    await expect(store.verify(challenge.challengeId,mails[0].code,request())).rejects.toThrow("inválido ou expirado");
  });
  it("registra tentativas inválidas e bloqueia após cinco",async()=>{
    const challenge=await store.start(user,request()),wrong=String((Number(mails[0].code)+1)%1_000_000).padStart(6,"0");
    for(let i=0;i<5;i++)await expect(store.verify(challenge.challengeId,wrong,request())).rejects.toThrow("inválido ou expirado");
    const [rows]=await pool.query<any[]>("SELECT attempts,consumed FROM srougi_login_codes WHERE id=?",[challenge.challengeId]);expect(rows[0]).toMatchObject({attempts:5,consumed:1});
    await expect(store.verify(challenge.challengeId,mails[0].code,request())).rejects.toThrow("inválido ou expirado");
  });
  it("rejeita código expirado, mudança de IP e mudança de senha",async()=>{
    let challenge=await store.start(user,request());
    await expect(store.verify(challenge.challengeId,mails[0].code,request("198.51.100.3"))).rejects.toThrow("inválido ou expirado");
    await pool.query("UPDATE users SET password='changed' WHERE id=1");
    await expect(store.verify(challenge.challengeId,mails[0].code,request())).rejects.toThrow("inválido ou expirado");
    await pool.query("UPDATE users SET password=? WHERE id=1",[user.password]);await pool.query("UPDATE srougi_login_codes SET expiresAt=DATE_SUB(NOW(3),INTERVAL 1 MINUTE)");
    await expect(store.verify(challenge.challengeId,mails[0].code,request())).rejects.toThrow("inválido ou expirado");
  });
  it("reenvio respeita intervalo e invalida o código anterior",async()=>{
    const first=await store.start(user,request());
    await expect(store.start(user,request())).rejects.toMatchObject({code:"TOO_MANY_REQUESTS"});
    await pool.query("UPDATE srougi_login_codes SET createdAt=DATE_SUB(NOW(3),INTERVAL 2 MINUTE)");
    const next=await store.start(user,request());
    await expect(store.verify(first.challengeId,mails[0].code,request())).rejects.toThrow("inválido ou expirado");
    await expect(store.verify(next.challengeId,mails[1].code,request())).resolves.toHaveProperty("proof");
  });
  it("falha de entrega invalida o desafio e não cria sessão",async()=>{
    store=new LoginEmailCodeStore(pool,async()=>{throw Error("synthetic-delivery-error");});
    await expect(store.start(user,request())).rejects.toThrow("Não foi possível enviar");
    const [rows]=await pool.query<any[]>("SELECT consumed,ready FROM srougi_login_codes");expect(rows[0]).toMatchObject({consumed:1,ready:0});
  });
  it("confirmação concorrente só autentica uma vez",async()=>{
    const challenge=await store.start(user,request());
    const results=await Promise.allSettled([store.verify(challenge.challengeId,mails[0].code,request()),store.verify(challenge.challengeId,mails[0].code,request())]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  });
  it("modo geral confirma e-mail sem depender de IP fixo ou cabeçalho do proxy",async()=>{
    vi.stubEnv("SECOND_FACTOR_ENABLED","true");vi.stubEnv("OFFICE_IP_HEADER_VERIFIED","false");
    const r={headers:{"user-agent":"Fixture"}} as any;
    const challenge=await store.start(user,r);
    expect(challenge.trustAvailable).toBe(true);
    const verified=await store.verify(challenge.challengeId,mails[0].code,r);
    expect(verified.proof.emailCodeIp).toBe("");
    expect(verified.user.id).toBe(1);
  });
});
