import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import express from "express";
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK,type JWTPayload} from "jose";
import jwt from "jsonwebtoken";
const fixture=vi.hoisted(()=>({keys:null as any}));
vi.mock("jose",async original=>({...await original<typeof import("jose")>(),createRemoteJWKSet:()=>((...args:any[])=>fixture.keys(...args))}));
vi.mock("./_core/env",()=>({ENV:{cookieSecret:"synthetic-access-session"}}));
import {accessConfiguration,verifyAccessToken,requestAccessIdentity,assertAccessAccount,assertAccessSession,assertAccessAccountsReady,mountCloudflareAccess} from "./cloudflareAccess";
import {accountFingerprint} from "./networkAccess";
let privateKey:CryptoKey;
const config={issuer:"https://fixture.cloudflareaccess.com",audience:"a".repeat(64)};
const identity={email:"fixture@example.invalid",subject:"fixture-subject"};
const user={id:1,email:identity.email,password:"synthetic-hash"};
const req=(token?:string,cookie="")=>({headers:{"cf-access-jwt-assertion":token,cookie}} as any);
async function token(overrides:JWTPayload={}) {
  return new SignJWT({iss:config.issuer,aud:config.audience,sub:identity.subject,email:identity.email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,...overrides}).setProtectedHeader({alg:"RS256",kid:"fixture"}).sign(privateKey);
}
beforeAll(async()=>{
const pair=await generateKeyPair("RS256");privateKey=pair.privateKey;
fixture.keys=vi.fn(createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:"fixture",alg:"RS256"}]}));
});
beforeEach(()=>{vi.stubEnv("CF_ACCESS_ENABLED","true");vi.stubEnv("CF_ACCESS_TEAM_DOMAIN",config.issuer);vi.stubEnv("CF_ACCESS_AUD",config.audience);vi.stubEnv("JWT_SECRET","synthetic-access-session");fixture.keys.mockClear();});
afterEach(()=>vi.unstubAllEnvs());
describe("Cloudflare Access: validação criptográfica e vínculo da conta",()=>{
it("valida assinatura, emissor e audiência e normaliza e-mail",async()=>{
expect(await verifyAccessToken(await token({email:" Fixture@Example.Invalid "}),config,fixture.keys)).toMatchObject(identity);
});
it.each([
{iss:"https://other.cloudflareaccess.com"},
{aud:"b".repeat(64)},
{exp:Math.floor(Date.now()/1000)-60},
{email:undefined},
{sub:undefined},
{exp:undefined},
{iat:undefined}
])("recusa claims inválidos ou ausentes",async claims=>{
await expect(verifyAccessToken(await token(claims),config,fixture.keys)).rejects.toThrow();
});
it("recusa assinatura de outra chave e HS256",async()=>{
const other=await generateKeyPair("RS256");
const forged=await new SignJWT({iss:config.issuer,aud:config.audience,email:identity.email,sub:identity.subject}).setProtectedHeader({alg:"RS256",kid:"fixture"}).setIssuedAt().setExpirationTime("10m").sign(other.privateKey);
await expect(verifyAccessToken(forged,config,fixture.keys)).rejects.toThrow();
const symmetric=await new SignJWT({email:identity.email}).setProtectedHeader({alg:"HS256"}).sign(new TextEncoder().encode("synthetic"));
await expect(verifyAccessToken(symmetric,config,fixture.keys)).rejects.toThrow();
});
it("não confia em e-mail de cabeçalho ou cookie sem assertion; verifica uma vez por requisição",async()=>{
await expect(requestAccessIdentity({headers:{"cf-access-authenticated-user-email":identity.email,cookie:"CF_Authorization=forged"}} as any)).rejects.toMatchObject({code:"FORBIDDEN"});
const r=req(await token());
await requestAccessIdentity(r);await requestAccessIdentity(r);
expect(fixture.keys).toHaveBeenCalledOnce();
});
it("e-mail deve corresponder a uma única conta e administradores não têm atalho",async()=>{
await expect(assertAccessAccount(user,identity,async()=>[1])).resolves.toBeUndefined();
await expect(assertAccessAccount({...user,email:"other@example.invalid"},identity,async()=>[1])).rejects.toMatchObject({code:"FORBIDDEN"});
await expect(assertAccessAccount(user,identity,async()=>[1,2])).rejects.toMatchObject({code:"FORBIDDEN"});
await expect(assertAccessAccount(user,identity,async()=>[2])).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("compartilhamento exige o endereço autorizado e exatamente admin/msrougi; não permite terceira conta",async()=>{
const owners=[{id:1,username:"admin"},{id:2,username:"msrougi"}];
await expect(assertAccessAccount(user,identity,async()=>owners)).rejects.toMatchObject({code:"FORBIDDEN"});
vi.stubEnv("CF_ACCESS_SHARED_OWNER_EMAIL",identity.email);
await expect(assertAccessAccount(user,identity,async()=>owners)).resolves.toBeUndefined();
await expect(assertAccessAccount({...user,id:2},identity,async()=>owners)).resolves.toBeUndefined();
await expect(assertAccessAccount({...user,id:3},identity,async()=>owners)).rejects.toMatchObject({code:"FORBIDDEN"});
for(const accounts of [[...owners,{id:3,username:"other"}],[{id:1,username:"admin"},{id:2,username:"rose"}],[{id:1,username:"msrougi"},{id:2,username:"msrougi"}]]){
await expect(assertAccessAccount(user,identity,async()=>accounts)).rejects.toMatchObject({code:"FORBIDDEN"});
expect(()=>assertAccessAccountsReady(accounts.map(account=>({...account,email:identity.email})))).toThrow("EMAIL_DUPLICATE");
}
expect(()=>assertAccessAccountsReady(owners.map(account=>({...account,email:identity.email})))).not.toThrow();
});
it("sessão do app exige vínculo à identidade e senha/e-mail atuais",()=>{
const cookie="app_session_id="+jwt.sign({userId:1,accessAccount:accountFingerprint(user),accessSubject:identity.subject},"synthetic-access-session",{expiresIn:"7d"});
expect(()=>assertAccessSession(user,req(undefined,cookie),identity)).not.toThrow();
expect(()=>assertAccessSession({...user,password:"changed"},req(undefined,cookie),identity)).toThrow("Entre novamente");
expect(()=>assertAccessSession(user,req(undefined,cookie),{...identity,subject:"other"})).toThrow("Entre novamente");
expect(()=>assertAccessSession(user,req(undefined,"app_session_id="+jwt.sign({userId:1},"synthetic-access-session")),identity)).toThrow("Entre novamente");
});
it("configuração impede URL arbitrária, AUD inválida e contas sem e-mail individual",()=>{
vi.stubEnv("CF_ACCESS_TEAM_DOMAIN","http://127.0.0.1/");expect(()=>accessConfiguration()).toThrow();
vi.stubEnv("CF_ACCESS_TEAM_DOMAIN",config.issuer);vi.stubEnv("CF_ACCESS_AUD","invalid");expect(()=>accessConfiguration()).toThrow();
expect(()=>assertAccessAccountsReady([{email:null}])).toThrow("EMAIL_MISSING");
expect(()=>assertAccessAccountsReady([{email:identity.email},{email:"Fixture@Example.Invalid"}])).toThrow("EMAIL_DUPLICATE");
});
it("origem protege páginas, API e OAuth; só healthz é público e modo desligado preserva acesso",async()=>{
const app=express();mountCloudflareAccess(app);app.use((_req,res)=>res.send("fixture-app"));
const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
try{
const address=server.address() as {port:number},base="http://127.0.0.1:"+address.port;
for(const path of ["/","/api/trpc/auth.me","/api/oauth/callback","/healthz/private"])expect((await fetch(base+path)).status).toBe(403);
expect(await (await fetch(base+"/healthz")).text()).toBe("ok");
expect((await fetch(base+"/api/trpc/auth.me",{headers:{"cf-access-jwt-assertion":await token()}})).status).toBe(200);
vi.stubEnv("CF_ACCESS_ENABLED","false");
expect(await (await fetch(base+"/")).text()).toBe("fixture-app");
}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
});
