import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from "jose";
const fixture=vi.hoisted(()=>({keys:null as any,authenticate:vi.fn(),lookup:vi.fn(),begin:vi.fn(),verify:vi.fn()}));
vi.mock("jose",async original=>({...await original<typeof import("jose")>(),createRemoteJWKSet:()=>((...args:any[])=>fixture.keys(...args))}));
vi.mock("./db",()=>({authenticateUser:fixture.authenticate,getDb:async()=>({$client:{promise:()=>({query:fixture.lookup})}})}));
vi.mock("./loginEmailCode",()=>({beginNetworkLogin:fixture.begin,emailCodeStore:async()=>({verify:fixture.verify})}));
vi.mock("./_core/env",()=>({ENV:{cookieSecret:"synthetic-access-session",isProduction:false}}));
import {appRouter} from "./routers";
const user={id:1,username:"fixture",email:"fixture@example.invalid",password:"synthetic-hash",role:"user",name:"Fixture"};
let privateKey:CryptoKey;
async function access(email=user.email,subject="fixture-subject") {
return new SignJWT({email}).setProtectedHeader({alg:"RS256",kid:"fixture"}).setIssuer("https://fixture.cloudflareaccess.com").setAudience("a".repeat(64)).setSubject(subject).setIssuedAt().setExpirationTime("10m").sign(privateKey);
}
function caller(assertion?:string,sessionUser:any=null,cookie="") {
const response={cookie:vi.fn(),clearCookie:vi.fn()};
const req={protocol:"https",headers:{"cf-access-jwt-assertion":assertion,"user-agent":"Fixture Desktop",cookie}};
return {response,api:appRouter.createCaller({user:sessionUser,req,res:response} as any)};
}
beforeAll(async()=>{
const pair=await generateKeyPair("RS256");privateKey=pair.privateKey;
fixture.keys=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:"fixture",alg:"RS256"}]});
});
beforeEach(()=>{
vi.clearAllMocks();vi.stubEnv("CF_ACCESS_ENABLED","true");vi.stubEnv("CF_ACCESS_TEAM_DOMAIN","https://fixture.cloudflareaccess.com");vi.stubEnv("CF_ACCESS_AUD","a".repeat(64));vi.stubEnv("JWT_SECRET","synthetic-access-session");
fixture.authenticate.mockResolvedValue(user);fixture.lookup.mockResolvedValue([[{id:1}],[]]);
});
afterEach(()=>vi.unstubAllEnvs());
describe("login protegido por Cloudflare Access",()=>{
it("pede senha, vincula sessão ao e-mail e não dispara 2FA interno mesmo com flags antigas",async()=>{
vi.stubEnv("SECOND_FACTOR_ENABLED","true");vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","true");
const assertion=await access(),login=caller(assertion);
await expect(login.api.customAuth.login({username:"fixture",password:"synthetic"})).resolves.toMatchObject({success:true,requiresCode:false});
expect(fixture.authenticate).toHaveBeenCalledWith("fixture","synthetic");
expect(fixture.begin).not.toHaveBeenCalled();expect(fixture.verify).not.toHaveBeenCalled();
const session=login.response.cookie.mock.calls[0][1];
await expect(caller(assertion,user,"app_session_id="+session).api.auth.me()).resolves.toMatchObject({id:1});
await expect(caller(assertion,{...user,password:"changed"},"app_session_id="+session).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("bloqueia e-mail diferente mesmo com senha correta e sessão antiga de administrador",async()=>{
const assertion=await access("other@example.invalid"),login=caller(assertion);
await expect(login.api.customAuth.login({username:"fixture",password:"synthetic"})).rejects.toMatchObject({code:"FORBIDDEN"});
expect(login.response.cookie).not.toHaveBeenCalled();
await expect(caller(assertion,{...user,role:"admin"}).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("sem assertion não chega a autenticar nem consultar cadastros",async()=>{
const s=caller();
await expect(s.api.customAuth.login({username:"fixture",password:"synthetic"})).rejects.toMatchObject({code:"FORBIDDEN"});
expect(fixture.authenticate).not.toHaveBeenCalled();expect(fixture.lookup).not.toHaveBeenCalled();
});
it("não aceita a etapa antiga de código e logout continua possível ao trocar de identidade",async()=>{
const assertion=await access(),s=caller(assertion);
await expect(s.api.customAuth.verifyLoginCode({challengeId:"a".repeat(64),code:"123456"})).rejects.toMatchObject({code:"BAD_REQUEST"});
expect(fixture.verify).not.toHaveBeenCalled();
await expect(caller(assertion,{...user,email:"other@example.invalid"}).api.auth.logout()).resolves.toMatchObject({success:true});
});
it("não concede papel administrativo pela autenticação externa",async()=>{
const assertion=await access(),login=caller(assertion);
await login.api.customAuth.login({username:"fixture",password:"synthetic"});
const session=login.response.cookie.mock.calls[0][1];
await expect(caller(assertion,user,"app_session_id="+session).api.admin.listUsers()).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("senha inválida não emite sessão e e-mail duplicado não autentica",async()=>{
const assertion=await access(),s=caller(assertion);
fixture.authenticate.mockResolvedValueOnce(null);
await expect(s.api.customAuth.login({username:"fixture",password:"wrong"})).rejects.toThrow("Usuário ou senha");
fixture.lookup.mockResolvedValue([[{id:1},{id:2}],[]]);
await expect(s.api.customAuth.login({username:"fixture",password:"synthetic"})).rejects.toMatchObject({code:"FORBIDDEN"});
expect(s.response.cookie).not.toHaveBeenCalled();
});
});
