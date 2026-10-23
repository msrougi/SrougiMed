import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from "jose";
const fixture=vi.hoisted(()=>({keys:null as any,authenticate:vi.fn(),lookup:vi.fn(),getUser:vi.fn(),begin:vi.fn()}));
vi.mock("jose",async original=>({...await original<typeof import("jose")>(),createRemoteJWKSet:()=>((...args:any[])=>fixture.keys(...args))}));
vi.mock("./db",()=>({authenticateUser:fixture.authenticate,getUserById:fixture.getUser,getDb:async()=>({$client:{promise:()=>({query:fixture.lookup})}})}));
vi.mock("./loginEmailCode",()=>({beginNetworkLogin:fixture.begin,emailCodeStore:vi.fn()}));
vi.mock("./_core/env",()=>({ENV:{cookieSecret:"synthetic-access-session",isProduction:false}}));
import {appRouter} from "./routers";
import {mountCloudflareAccess,assertAccessAccountsReady} from "./cloudflareAccess";
import {ACCESS_CALLBACK,ACCESS_PENDING_COOKIE,isBiaPasswordOnly,validateAccessLoginFlow} from "./cloudflareLoginFlow";
const user={id:1,username:"fixture",name:"Fixture",email:"fixture@example.invalid",password:"synthetic-hash",role:"user"};
const bia={...user,id:9,username:"bia",email:null};
let privateKey:CryptoKey;
async function access(email=user.email,seconds=600) {
  return new SignJWT({email}).setProtectedHeader({alg:"RS256",kid:"fixture"}).setIssuer("https://fixture.cloudflareaccess.com").setAudience("a".repeat(64)).setSubject("fixture-subject").setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+seconds).sign(privateKey);
}
function caller(sessionUser:any=null,cookie="",agent="Fixture Desktop") {
  const response={cookie:vi.fn(),clearCookie:vi.fn()};
  const req={protocol:"https",headers:{"user-agent":agent,cookie}};
  return {response,api:appRouter.createCaller({user:sessionUser,req,res:response} as any)};
}
function cookieValue(response:ReturnType<typeof caller>["response"],name:string) {
  return response.cookie.mock.calls.find(([key])=>key===name)?.[1];
}
beforeAll(async()=>{
  const pair=await generateKeyPair("RS256");privateKey=pair.privateKey;
  fixture.keys=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:"fixture",alg:"RS256"}]});
});
beforeEach(()=>{
  vi.clearAllMocks();
  for(const [key,value] of Object.entries({CF_ACCESS_ENABLED:"true",CF_ACCESS_LOGIN_FLOW:"true",BIA_DEVICE_ACCESS_ENABLED:"false",NATIVE_EMAIL_LOGIN:"false",CF_ACCESS_BIA_USER_ID:"9",SROUGI_PUBLIC_ORIGIN:"https://app.example.invalid",CF_ACCESS_TEAM_DOMAIN:"https://fixture.cloudflareaccess.com",CF_ACCESS_AUD:"a".repeat(64),JWT_SECRET:"synthetic-access-session",SECOND_FACTOR_ENABLED:"true",OFFICE_ACCESS_POLICY_ENABLED:"true"}))vi.stubEnv(key,value);
  fixture.authenticate.mockResolvedValue(user);fixture.getUser.mockResolvedValue(user);fixture.lookup.mockResolvedValue([[{id:1}],[]]);
});

describe("2FA da Bia com postura do Cloudflare One Client",()=>{
  it("mantém o 2FA nativo dos demais usuários e só conclui a sessão da Bia após a Cloudflare",async()=>{
    vi.stubEnv("CF_ACCESS_ENABLED","false");
    vi.stubEnv("CF_ACCESS_LOGIN_FLOW","false");
    vi.stubEnv("BIA_DEVICE_ACCESS_ENABLED","true");
    vi.stubEnv("NATIVE_EMAIL_LOGIN","true");
    vi.stubEnv("SECOND_FACTOR_BIA_USER_ID","");
    const deviceBia={...bia,email:"bsbancala@example.invalid"};
    fixture.begin.mockResolvedValueOnce({success:false,requiresCode:true,challengeId:"a".repeat(64),emailHint:"fi*****@example.invalid",trustAvailable:true,resendAvailable:true});
    const commonLogin=caller();
    await expect(commonLogin.api.customAuth.login({username:"fixture",password:"synthetic"})).resolves.toMatchObject({requiresCode:true});
    expect(cookieValue(commonLogin.response,ACCESS_PENDING_COOKIE)).toBeUndefined();
    fixture.begin.mockClear();

    fixture.authenticate.mockResolvedValue(deviceBia);
    fixture.getUser.mockResolvedValue(deviceBia);
    fixture.lookup.mockResolvedValue([[{id:9,username:"bia"}],[]]);

    const login=caller();
    await expect(login.api.customAuth.login({username:"bia",password:"synthetic"})).resolves.toMatchObject({success:false,requiresAccess:true,redirectUrl:"https://app.example.invalid/auth/cloudflare"});
    expect(fixture.begin).not.toHaveBeenCalled();
    expect(cookieValue(login.response,"app_session_id")).toBeUndefined();

    const app=express();mountCloudflareAccess(app);app.use((_req,res)=>res.send("public-login-shell"));
    const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
    try{
      expect((await fetch("http://127.0.0.1:"+(server.address() as {port:number}).port+"/")).status).toBe(200);
      const pending=ACCESS_PENDING_COOKIE+"="+cookieValue(login.response,ACCESS_PENDING_COOKIE);
      const response=await fetch("http://127.0.0.1:"+(server.address() as {port:number}).port+ACCESS_CALLBACK,{redirect:"manual",headers:{cookie:pending,"user-agent":"Fixture Desktop","cf-access-jwt-assertion":await access(deviceBia.email)}});
      expect(response.status).toBe(303);
      const session=response.headers.getSetCookie().find(c=>c.startsWith("app_session_id="))!.split(";")[0];
      await expect(caller(deviceBia,session).api.auth.me()).resolves.toMatchObject({id:9,username:"bia"});
      await expect(caller({...deviceBia,id:10},session).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
});
afterEach(()=>vi.unstubAllEnvs());
describe("2FA seletivo: senha antes da Cloudflare e exceção temporária da Bia",()=>{
  it("senha correta inicia confirmação sem emitir sessão; senha incorreta não inicia confirmação",async()=>{
    const login=caller();
    await expect(login.api.customAuth.login({username:"fixture",password:"synthetic"})).resolves.toMatchObject({success:false,requiresAccess:true,redirectUrl:"https://app.example.invalid/auth/cloudflare"});
    expect(cookieValue(login.response,"app_session_id")).toBeUndefined();
    const pending=cookieValue(login.response,ACCESS_PENDING_COOKIE);
    expect(pending).toBeTruthy();
    await expect(caller(user,"app_session_id="+pending).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    fixture.authenticate.mockResolvedValueOnce(null);
    const bad=caller();await expect(bad.api.customAuth.login({username:"fixture",password:"wrong"})).rejects.toThrow("Usuário ou senha");
    expect(bad.response.cookie).not.toHaveBeenCalled();expect(fixture.begin).not.toHaveBeenCalled();
  });
  it("Bia entra com senha somente em desktop e não acessa administração ou outra conta",async()=>{
    fixture.authenticate.mockResolvedValue(bia);
    const login=caller();await expect(login.api.customAuth.login({username:"bia",password:"synthetic"})).resolves.toMatchObject({success:true});
    const cookie="app_session_id="+cookieValue(login.response,"app_session_id");
    await expect(caller(bia,cookie).api.auth.me()).resolves.toMatchObject({id:9});
    await expect(caller(bia,cookie).api.admin.listUsers()).rejects.toMatchObject({code:"FORBIDDEN"});
    for(const changed of [{...bia,id:10},{...bia,role:"admin"},{...bia,password:"changed"},{...bia,username:"another"}])await expect(caller(changed,cookie).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller(bia,cookie,"Mozilla iPhone Mobile").api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller(null,"","Mozilla Android Mobile").api.customAuth.login({username:"bia",password:"synthetic"})).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(fixture.begin).not.toHaveBeenCalled();
  });
  it("não reconhece uma conta homônima nem permite ampliar a exceção por login ou papel",()=>{
    expect(isBiaPasswordOnly(bia)).toBe(true);
    expect(isBiaPasswordOnly({...bia,id:99})).toBe(false);
    expect(isBiaPasswordOnly({...bia,role:"admin"})).toBe(false);
    expect(()=>assertAccessAccountsReady([user,bia])).not.toThrow();
    expect(()=>assertAccessAccountsReady([user,{...bia,id:99}])).toThrow("EMAIL_MISSING");
    expect(()=>assertAccessAccountsReady([user])).toThrow("BIA_ACCOUNT_NOT_READY");
    expect(()=>assertAccessAccountsReady([user,bia,{...user,id:2}])).toThrow("EMAIL_DUPLICATE");
    vi.stubEnv("CF_ACCESS_BIA_USER_ID","");expect(isBiaPasswordOnly(bia)).toBe(false);
  });
  it("recusa sessões antigas, credenciais falsificadas e configuração insegura",async()=>{
    const old=jwt.sign({userId:1},"synthetic-access-session",{expiresIn:"7d"});
    await expect(caller(user,"app_session_id="+old).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    const forged=jwt.sign({userId:9,accessMethod:"password-only-bia"},"wrong-key");
    await expect(caller(bia,"app_session_id="+forged).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    vi.stubEnv("SROUGI_PUBLIC_ORIGIN","http://app.example.invalid");expect(validateAccessLoginFlow).toThrow();
    vi.stubEnv("SROUGI_PUBLIC_ORIGIN","https://app.example.invalid/path");expect(validateAccessLoginFlow).toThrow();
    vi.stubEnv("SROUGI_PUBLIC_ORIGIN","https://app.example.invalid");vi.stubEnv("CF_ACCESS_BIA_USER_ID","0");expect(validateAccessLoginFlow).toThrow();
  });
  it("e-mail compartilhado não permite trocar de conta por uma sessão nem herdar papel administrativo",async()=>{
    vi.stubEnv("CF_ACCESS_SHARED_OWNER_EMAIL",user.email);
    const owner={...user,username:"msrougi"};
    const admin={...user,id:2,username:"admin",role:"admin"};
    fixture.authenticate.mockResolvedValue(owner);fixture.getUser.mockResolvedValue(owner);
    fixture.lookup.mockResolvedValue([[{id:1,username:"msrougi"},{id:2,username:"admin"}],[]]);
    const app=express();mountCloudflareAccess(app);
    const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
    try{
      const login=caller();await login.api.customAuth.login({username:"msrougi",password:"synthetic"});
      const pending=ACCESS_PENDING_COOKIE+"="+cookieValue(login.response,ACCESS_PENDING_COOKIE);
      const response=await fetch("http://127.0.0.1:"+(server.address() as {port:number}).port+ACCESS_CALLBACK,{redirect:"manual",headers:{cookie:pending,"user-agent":"Fixture Desktop","cf-access-jwt-assertion":await access()}});
      expect(response.status).toBe(303);
      const cookie=response.headers.getSetCookie().find(c=>c.startsWith("app_session_id="))!.split(";")[0];
      await expect(caller(owner,cookie).api.auth.me()).resolves.toMatchObject({id:1,role:"user"});
      await expect(caller(admin,cookie).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
      await expect(caller(owner,cookie).api.admin.listUsers()).rejects.toMatchObject({code:"FORBIDDEN"});
    }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
  it("callback exige senha recente, assertion assinada e o e-mail exato; API só aceita sessão concluída",async()=>{
    const app=express();mountCloudflareAccess(app);app.use((_req,res)=>res.send("public-login-shell"));
    const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
    const base="http://127.0.0.1:"+(server.address() as {port:number}).port;
    async function pending(){const login=caller();await login.api.customAuth.login({username:"fixture",password:"synthetic"});return ACCESS_PENDING_COOKIE+"="+cookieValue(login.response,ACCESS_PENDING_COOKIE);}
    const callback=async(cookie:string,assertion?:string,agent="Fixture Desktop")=>fetch(base+ACCESS_CALLBACK,{redirect:"manual",headers:{cookie,"user-agent":agent,...(assertion?{"cf-access-jwt-assertion":assertion}:{})}});
    try{
      expect((await fetch(base+"/")).status).toBe(200);
      expect((await fetch(base+"/api/oauth/callback")).status).toBe(403);
      expect((await callback("",await access())).status).toBe(403);
      expect((await callback(await pending())).status).toBe(403);
      expect((await callback(await pending(),"forged")).status).toBe(403);
      expect((await callback(await pending(),await access("other@example.invalid"))).status).toBe(403);
      expect((await callback(await pending(),await access(),"Other Desktop")).status).toBe(403);
      fixture.lookup.mockResolvedValueOnce([[{id:1},{id:2}],[]]);
      expect((await callback(await pending(),await access())).status).toBe(403);
      const cookie=await pending();fixture.getUser.mockResolvedValueOnce({...user,password:"changed"});
      expect((await callback(cookie,await access())).status).toBe(403);
      const response=await callback(await pending(),await access());
      expect(response.status).toBe(303);expect(response.headers.get("location")).toBe("/dashboard");
      const session=response.headers.getSetCookie().find(c=>c.startsWith("app_session_id="))!.split(";")[0];
      await expect(caller(user,session).api.auth.me()).resolves.toMatchObject({id:1});
      await expect(caller({...user,email:"changed@example.invalid"},session).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
      await expect(caller(user,session).api.admin.listUsers()).rejects.toMatchObject({code:"FORBIDDEN"});
      const raw=decodeURIComponent(session.slice("app_session_id=".length));
      const claims=jwt.verify(raw,"synthetic-access-session") as jwt.JwtPayload;
      expect(claims.exp!-claims.iat!).toBeLessThanOrEqual(600);
      const expired=jwt.sign({...claims,exp:Math.floor(Date.now()/1000)-10},"synthetic-access-session");
      await expect(caller(user,"app_session_id="+expired).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
      const expiredPending=jwt.sign({userId:1},"synthetic-access-session",{issuer:"srougimed",audience:"access-pending",expiresIn:-10});
      expect((await callback(ACCESS_PENDING_COOKIE+"="+expiredPending,await access())).status).toBe(403);
    }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
});
