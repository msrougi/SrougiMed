import {beforeAll,beforeEach,afterAll,describe,expect,it,vi} from "vitest";
import mysql from "mysql2/promise";
import {LoginEmailCodeStore,type CodeMail} from "./loginEmailCode";
import {prepareLoginEmails} from "./prepareLoginEmails";
import {prepareNetworkAccess} from "./prepareNetworkAccess";
import {getDb} from "./db";
const url=process.env.SROUGI_NETWORK_TEST_DATABASE_URL;
if(url){const u=new URL(url);if(!["127.0.0.1","localhost","[::1]"].includes(u.hostname)||!/^\/srougi_test_network[a-z0-9_]*$/.test(u.pathname))throw Error("Network tests require isolated localhost database");}
describe.skipIf(!url)("códigos de e-mail — MySQL isolado",()=>{
  let pool:mysql.Pool,store:LoginEmailCodeStore,appDatabase:Awaited<ReturnType<typeof getDb>>;
  let mails:CodeMail[]=[];
  const user={id:1,username:"rose",email:"fixture@example.invalid",password:"synthetic-hash"};
  const request=(ip="198.51.100.2",agent="Fixture")=>({headers:{"true-client-ip":ip,"user-agent":agent}} as any);
  beforeAll(async()=>{
    pool=mysql.createPool(url!);
    await pool.query("CREATE TABLE IF NOT EXISTS users(id INT PRIMARY KEY,username VARCHAR(100),name TEXT,email VARCHAR(320),password VARCHAR(255),role VARCHAR(20) DEFAULT 'user') ENGINE=InnoDB");
    vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","false");const connection=await pool.getConnection();try{await prepareNetworkAccess(connection);await prepareNetworkAccess(connection);}finally{connection.release();}
  });
  beforeEach(async()=>{
    vi.stubEnv("NATIVE_EMAIL_LOGIN","false");vi.stubEnv("SECOND_FACTOR_BIA_USER_ID","");
    vi.stubEnv("CF_ACCESS_SHARED_OWNER_EMAIL","");vi.stubEnv("CF_ACCESS_LOGIN_FLOW","false");vi.stubEnv("CF_ACCESS_BIA_USER_ID","");vi.stubEnv("CF_ACCESS_ENABLED","false");vi.stubEnv("AUTH_LOGIN_EMAILS_JSON","");vi.stubEnv("SECOND_FACTOR_ENABLED","false");vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","true");vi.stubEnv("OFFICE_PUBLIC_IP","198.51.100.1");vi.stubEnv("OFFICE_CLIENT_IP_HEADER","true-client-ip");vi.stubEnv("OFFICE_IP_HEADER_VERIFIED","true");vi.stubEnv("JWT_SECRET","synthetic-network-test-key");
    mails=[];store=new LoginEmailCodeStore(pool,async mail=>{mails.push(mail);});
    await pool.query("DELETE FROM srougi_login_codes");await pool.query("DELETE FROM users");
    await pool.query("INSERT INTO users(id,username,email,password) VALUES(?,?,?,?)",[1,user.username,user.email,user.password]);
  });
  afterAll(async()=>{await pool?.end();if(appDatabase)await appDatabase.$client.promise().end();vi.unstubAllEnvs();});
  it("modo nativo usa o e-mail do cadastro, consome código uma vez e recusa endereço duplicado",async()=>{
    vi.stubEnv("SECOND_FACTOR_ENABLED","true");vi.stubEnv("NATIVE_EMAIL_LOGIN","true");vi.stubEnv("DATABASE_URL",url!);
    appDatabase=await getDb();
    const r={headers:{"user-agent":"Fixture"}} as any;
    const challenge=await store.start(user,r);
    expect(challenge).toMatchObject({emailHint:"fi*****@example.invalid",resendAvailable:true,trustAvailable:true});
    await expect(store.verify(challenge.challengeId,mails[0].code,r)).resolves.toMatchObject({user:{id:1}});
    await expect(store.verify(challenge.challengeId,mails[0].code,r)).rejects.toThrow("inválido ou expirado");
    await pool.query("UPDATE srougi_login_codes SET createdAt=DATE_SUB(NOW(3),INTERVAL 61 SECOND)");
    const next=await store.start(user,r);
    await pool.query("INSERT INTO users(id,username,email,password) VALUES(2,'other',?,'synthetic')",[user.email]);
    await expect(store.verify(next.challengeId,mails[1].code,r)).rejects.toMatchObject({code:"FORBIDDEN"});
    const [rows]=await pool.query<any[]>("SELECT consumed FROM srougi_login_codes WHERE id=?",[next.challengeId]);
    expect(Number(rows[0].consumed)).toBe(0);
  });
  it("preparação nativa permite Bia sem e-mail e preserva somente o compartilhamento autorizado",async()=>{
    vi.stubEnv("SECOND_FACTOR_ENABLED","true");vi.stubEnv("NATIVE_EMAIL_LOGIN","true");vi.stubEnv("SECOND_FACTOR_BIA_USER_ID","9");
    vi.stubEnv("AUTH_EMAIL_PROVIDER","resend");vi.stubEnv("AUTH_EMAIL_FROM","access@example.invalid");vi.stubEnv("RESEND_API_KEY","synthetic-only");
    vi.stubEnv("CF_ACCESS_SHARED_OWNER_EMAIL","owner@example.invalid");
    await pool.query("INSERT INTO users(id,username,email,password,role) VALUES(9,'bia',NULL,'synthetic','user'),(2,'admin','owner@example.invalid','synthetic','admin'),(3,'msrougi','owner@example.invalid','synthetic','user')");
    const c=await pool.getConnection();try{
      await prepareNetworkAccess(c);
      await pool.query("INSERT INTO users(id,username,email,password) VALUES(4,'other','owner@example.invalid','synthetic')");
      await expect(prepareNetworkAccess(c)).rejects.toThrow("EMAIL_DUPLICATE");
      await pool.query("DELETE FROM users WHERE id=4");
      await pool.query("UPDATE users SET role='admin' WHERE id=9");
      await expect(prepareNetworkAccess(c)).rejects.toThrow("BIA_ACCOUNT_NOT_READY");
    }finally{c.release();}
  });
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
  it("atualiza somente e-mails dos três logins autorizados, sem mudar senhas, e é repetível",async()=>{
    await pool.query("INSERT INTO users(id,username,email,password) VALUES (2,'gislene','old@example.invalid','hash2'),(3,'rosani','old@example.invalid','hash3'),(4,'other','untouched@example.invalid','hash4')");
    const mapping={rose:"r@example.invalid",gislene:"g@example.invalid",rosani:"s@example.invalid"};
    vi.stubEnv("AUTH_LOGIN_EMAILS_JSON",JSON.stringify(mapping));
    const c=await pool.getConnection();try{await prepareLoginEmails(c);await prepareLoginEmails(c);}finally{c.release();}
    const [rows]=await pool.query<any[]>("SELECT id,email,password FROM users ORDER BY id");
    expect(rows.map(r=>r.email)).toEqual([mapping.rose,mapping.gislene,mapping.rosani,"untouched@example.invalid"]);
    expect(rows.map(r=>r.password)).toEqual([user.password,"hash2","hash3","hash4"]);
  });
  it("mapeamento incompleto ou login ausente não altera parcialmente os e-mails",async()=>{
    vi.stubEnv("AUTH_LOGIN_EMAILS_JSON",JSON.stringify({rose:"r@example.invalid",gislene:"g@example.invalid",rosani:"s@example.invalid"}));
    const c=await pool.getConnection();try{
      await expect(prepareLoginEmails(c)).rejects.toThrow("AUTH_LOGIN_ACCOUNT_NOT_UNIQUE");
      vi.stubEnv("AUTH_LOGIN_EMAILS_JSON","{}");
      await expect(prepareLoginEmails(c)).rejects.toThrow("AUTH_LOGIN_EMAILS_INVALID");
    }finally{c.release();}
    const [rows]=await pool.query<any[]>("SELECT email FROM users WHERE id=1");expect(rows[0].email).toBe(user.email);
  });
  it("vincula os logins adicionais autorizados e recusa compartilhar e-mail entre contas",async()=>{
    await pool.query("INSERT INTO users(id,username,email,password) VALUES (2,'gislene',NULL,'hash2'),(3,'rosani',NULL,'hash3'),(4,'miguel',NULL,'hash4'),(5,'msrougi',NULL,'hash5'),(6,'admin',NULL,'hash6')");
    const mapping={rose:"r@example.invalid",gislene:"g@example.invalid",rosani:"s@example.invalid",miguel:"m@example.invalid",msrougi:"owner@example.invalid",admin:"admin@example.invalid"};
    vi.stubEnv("AUTH_LOGIN_EMAILS_JSON",JSON.stringify(mapping));
    const c=await pool.getConnection();try{
      await prepareLoginEmails(c);await prepareLoginEmails(c);
      vi.stubEnv("AUTH_LOGIN_EMAILS_JSON",JSON.stringify({...mapping,miguel:mapping.rose}));
      await expect(prepareLoginEmails(c)).rejects.toThrow("AUTH_LOGIN_EMAIL_NOT_UNIQUE");
    }finally{c.release();}
    const [rows]=await pool.query<any[]>("SELECT username,email,password FROM users ORDER BY id");
    for(const row of rows)expect(row.email).toBe(mapping[row.username as keyof typeof mapping]);
    expect(rows[3].password).toBe("hash4");
  });
  it("modo seletivo dispensa e-mail somente da conta Bia autorizada",async()=>{
    vi.stubEnv("CF_ACCESS_ENABLED","true");vi.stubEnv("CF_ACCESS_LOGIN_FLOW","true");vi.stubEnv("CF_ACCESS_BIA_USER_ID","9");
    vi.stubEnv("SROUGI_PUBLIC_ORIGIN","https://app.example.invalid");vi.stubEnv("CF_ACCESS_TEAM_DOMAIN","https://fixture.cloudflareaccess.com");vi.stubEnv("CF_ACCESS_AUD","a".repeat(64));
    await pool.query("INSERT INTO users(id,username,email,password) VALUES(9,'bia',NULL,'synthetic')");
    const c=await pool.getConnection();try{
      await prepareNetworkAccess(c);
      await pool.query("UPDATE users SET role='admin' WHERE id=9");
      await expect(prepareNetworkAccess(c)).rejects.toThrow("EMAIL_MISSING");
      await pool.query("UPDATE users SET role='user',id=10 WHERE id=9");
      await expect(prepareNetworkAccess(c)).rejects.toThrow("EMAIL_MISSING");
    }finally{c.release();}
  });
  it("sincroniza o endereço compartilhado de admin/msrougi somente quando autorizado e recusa terceiros",async()=>{
    await pool.query("INSERT INTO users(id,username,email,password) VALUES (2,'gislene',NULL,'hash2'),(3,'rosani',NULL,'hash3'),(4,'admin',NULL,'hash4'),(5,'msrougi',NULL,'hash5')");
    const mapping={rose:"r@example.invalid",gislene:"g@example.invalid",rosani:"s@example.invalid",admin:"owner@example.invalid",msrougi:"owner@example.invalid"};
    vi.stubEnv("AUTH_LOGIN_EMAILS_JSON",JSON.stringify(mapping));
    const c=await pool.getConnection();try{
      await expect(prepareLoginEmails(c)).rejects.toThrow("AUTH_LOGIN_EMAIL_NOT_UNIQUE");
      vi.stubEnv("CF_ACCESS_SHARED_OWNER_EMAIL",mapping.admin);
      await prepareLoginEmails(c);
      const [rows]=await pool.query<any[]>("SELECT email,password FROM users WHERE id IN(4,5) ORDER BY id");
      expect(rows.map(row=>row.email)).toEqual([mapping.admin,mapping.msrougi]);
      expect(rows.map(row=>row.password)).toEqual(["hash4","hash5"]);
      vi.stubEnv("AUTH_LOGIN_EMAILS_JSON",JSON.stringify({...mapping,rose:mapping.admin}));
      await expect(prepareLoginEmails(c)).rejects.toThrow("AUTH_LOGIN_EMAIL_NOT_UNIQUE");
    }finally{c.release();}
  });
  it("Cloudflare Access dispensa configuração de envio e exige e-mails individuais",async()=>{
    vi.stubEnv("CF_ACCESS_ENABLED","true");vi.stubEnv("CF_ACCESS_TEAM_DOMAIN","https://fixture.cloudflareaccess.com");vi.stubEnv("CF_ACCESS_AUD","a".repeat(64));
    vi.stubEnv("RESEND_API_KEY","");vi.stubEnv("AUTH_EMAIL_FROM","");
    const c=await pool.getConnection();try{
      await prepareNetworkAccess(c);
      await pool.query("INSERT INTO users(id,username,email,password) VALUES(2,'other',?,'synthetic')",[user.email]);
      await expect(prepareNetworkAccess(c)).rejects.toThrow("CLOUDFLARE_ACCESS_ACCOUNT_EMAIL_DUPLICATE");
      await pool.query("UPDATE users SET email=NULL WHERE id=2");
      await expect(prepareNetworkAccess(c)).rejects.toThrow("CLOUDFLARE_ACCESS_ACCOUNT_EMAIL_MISSING");
    }finally{c.release();}
  });
});
