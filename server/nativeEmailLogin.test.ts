import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import jwt from "jsonwebtoken";
import express from "express";
const fixture=vi.hoisted(()=>({authenticate:vi.fn(),getUser:vi.fn(),lookup:vi.fn(),start:vi.fn(),verify:vi.fn(),trusted:vi.fn(),create:vi.fn()}));
vi.mock("./db",()=>({authenticateUser:fixture.authenticate,getUserById:fixture.getUser,getDb:async()=>({$client:{promise:()=>({query:fixture.lookup})}})}));
vi.mock("./loginEmailCode",async original=>({...await original<typeof import("./loginEmailCode")>(),emailCodeStore:async()=>({start:fixture.start,verify:fixture.verify})}));
vi.mock("./trustedDevices",async original=>({...await original<typeof import("./trustedDevices")>(),trustedDeviceStore:async()=>({fromCookie:fixture.trusted,create:fixture.create,valid:async()=>true})}));
vi.mock("./_core/env",()=>({ENV:{cookieSecret:"synthetic-native-key",isProduction:false}}));
import {appRouter} from "./routers";
import {NATIVE_PENDING_COOKIE,maskLoginEmail} from "./nativeEmailLogin";
import {accountFingerprint,makeEmailProof,validateNetworkConfiguration} from "./networkAccess";
const user={id:1,username:"fixture",name:"Fixture",role:"user",email:"fixture@example.invalid",password:"synthetic-hash"};
const req=(cookie="",agent="Fixture Desktop")=>({protocol:"https",headers:{cookie,"user-agent":agent}} as any);
function caller(cookie="",sessionUser:any=null,agent="Fixture Desktop"){
  const response={cookie:vi.fn(),clearCookie:vi.fn()};
  return {response,api:appRouter.createCaller({user:sessionUser,req:req(cookie,agent),res:response} as any)};
}
const cookieValue=(response:ReturnType<typeof caller>["response"],name:string)=>response.cookie.mock.calls.find(c=>c[0]===name)?.[1];
async function prepare(){const s=caller();await s.api.customAuth.login({username:user.username,password:"synthetic"});return NATIVE_PENDING_COOKIE+"="+cookieValue(s.response,NATIVE_PENDING_COOKIE);}
beforeEach(()=>{
  vi.clearAllMocks();
  for(const [key,value] of Object.entries({CF_ACCESS_ENABLED:"false",BIA_DEVICE_ACCESS_ENABLED:"false",SECOND_FACTOR_ENABLED:"true",NATIVE_EMAIL_LOGIN:"true",SECOND_FACTOR_BIA_USER_ID:"9",JWT_SECRET:"synthetic-native-key",AUTH_EMAIL_PROVIDER:"resend",AUTH_EMAIL_FROM:"access@example.invalid",RESEND_API_KEY:"synthetic-resend",OFFICE_ACCESS_POLICY_ENABLED:"false"}))vi.stubEnv(key,value);
  fixture.authenticate.mockResolvedValue(user);fixture.getUser.mockResolvedValue(user);fixture.lookup.mockResolvedValue([[{id:1,username:user.username}],[]]);fixture.trusted.mockResolvedValue(null);
  fixture.start.mockResolvedValue({success:false,requiresCode:true,challengeId:"a".repeat(64),emailHint:"fi*****@example.invalid",trustAvailable:true,resendAvailable:true});
  fixture.verify.mockResolvedValue({user,proof:makeEmailProof(user,req())});
});
afterEach(()=>vi.unstubAllEnvs());
describe("confirmação nativa com destinatário cadastrado",()=>{
  it("senha correta só prepara confirmação e máscara; não envia nem autentica",async()=>{
    const s=caller();await expect(s.api.customAuth.login({username:user.username,password:"synthetic"})).resolves.toMatchObject({success:false,requiresSendCode:true,emailHint:"fi*****@example.invalid"});
    expect(fixture.start).not.toHaveBeenCalled();expect(cookieValue(s.response,"app_session_id")).toBeUndefined();
    expect(s.response.cookie).toHaveBeenCalledWith(NATIVE_PENDING_COOKIE,expect.any(String),expect.objectContaining({secure:true,httpOnly:true,sameSite:"strict",maxAge:300000}));
    const raw=cookieValue(s.response,NATIVE_PENDING_COOKIE);
    await expect(caller("app_session_id="+raw,user).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    fixture.authenticate.mockResolvedValueOnce(null);await expect(caller().api.customAuth.login({username:user.username,password:"wrong"})).rejects.toThrow("Usuário ou senha");
    expect(fixture.start).not.toHaveBeenCalled();
  });
  it("envio exige senha recente no mesmo navegador e não aceita outro destinatário",async()=>{
    const cookie=await prepare(),s=caller(cookie);
    await expect(s.api.customAuth.sendLoginCode({})).resolves.toMatchObject({requiresCode:true});
    expect(fixture.start).toHaveBeenCalledWith(user,expect.anything());
    expect(cookieValue(s.response,"app_session_id")).toBeUndefined();
    fixture.start.mockClear();
    await expect(caller(cookie,null,"Other Desktop").api.customAuth.sendLoginCode({})).rejects.toMatchObject({code:"UNAUTHORIZED"});
    await expect(caller().api.customAuth.sendLoginCode({})).rejects.toMatchObject({code:"UNAUTHORIZED"});
    await expect(caller(cookie).api.customAuth.sendLoginCode({to:"other@example.invalid"} as any)).rejects.toMatchObject({code:"BAD_REQUEST"});
    fixture.getUser.mockResolvedValueOnce({...user,password:"changed"});
    await expect(caller(cookie).api.customAuth.sendLoginCode({})).rejects.toMatchObject({code:"UNAUTHORIZED"});
    const expired=jwt.sign({userId:1,account:accountFingerprint(user)},"synthetic-native-key",{issuer:"srougimed",audience:"native-email-pending",expiresIn:-1});
    await expect(caller(NATIVE_PENDING_COOKIE+"="+expired).api.customAuth.sendLoginCode({})).rejects.toMatchObject({code:"UNAUTHORIZED"});
    expect(fixture.start).not.toHaveBeenCalled();
  });
  it("erro de entrega não autentica; só código confirmado emite sessão e limpa preparação",async()=>{
    const cookie=await prepare(),s=caller(cookie);fixture.start.mockRejectedValueOnce(Error("synthetic-delivery-failure"));
    await expect(s.api.customAuth.sendLoginCode({})).rejects.toThrow();expect(cookieValue(s.response,"app_session_id")).toBeUndefined();
    await s.api.customAuth.verifyLoginCode({challengeId:"a".repeat(64),code:"123456",trustDevice:false});
    expect(s.response.clearCookie).toHaveBeenCalledWith(NATIVE_PENDING_COOKIE,expect.objectContaining({secure:true,httpOnly:true}));
    const session="app_session_id="+cookieValue(s.response,"app_session_id");
    await expect(caller(session,user).api.auth.me()).resolves.toMatchObject({id:1});
    await expect(caller(session,user).api.admin.listUsers()).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller(session,{...user,password:"changed"}).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("Bia exige 2FA nativo como os demais, mesmo com as antigas exceções configuradas",async()=>{
    vi.stubEnv("BIA_DEVICE_ACCESS_ENABLED","true");vi.stubEnv("CF_ACCESS_BIA_USER_ID","9");
    const bia={...user,id:9,username:"bia",email:"bsbancala@example.invalid"};fixture.authenticate.mockResolvedValue(bia);fixture.getUser.mockResolvedValue(bia);fixture.lookup.mockResolvedValue([[{id:9,username:"bia"}],[]]);
    for(const agent of ["Fixture Desktop","iPhone Mobile"]){
      const s=caller("",null,agent);
      await expect(s.api.customAuth.login({username:"bia",password:"synthetic"})).resolves.toMatchObject({success:false,requiresSendCode:true,emailHint:"bs*****@example.invalid"});
      expect(cookieValue(s.response,"app_session_id")).toBeUndefined();
      const pending=NATIVE_PENDING_COOKIE+"="+cookieValue(s.response,NATIVE_PENDING_COOKIE);
      const confirmation=caller(pending,null,agent);
      await confirmation.api.customAuth.sendLoginCode({});
      expect(fixture.start).toHaveBeenCalledWith(bia,expect.anything());
    }
    await expect(caller("",bia).api.auth.me()).rejects.toMatchObject({code:"FORBIDDEN"});
    fixture.authenticate.mockResolvedValue({...bia,email:null});
    await expect(caller().api.customAuth.login({username:"bia",password:"synthetic"})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("mantém e-mail compartilhado só para admin/msrougi sem compartilhar sessão ou papel",async()=>{
    vi.stubEnv("CF_ACCESS_SHARED_OWNER_EMAIL",user.email);
    const owner={...user,username:"msrougi"};fixture.authenticate.mockResolvedValue(owner);fixture.lookup.mockResolvedValue([[{id:1,username:"msrougi"},{id:2,username:"admin"}],[]]);
    const s=caller();await expect(s.api.customAuth.login({username:"msrougi",password:"synthetic"})).resolves.toMatchObject({requiresSendCode:true});
    fixture.lookup.mockResolvedValue([[{id:1,username:"msrougi"},{id:2,username:"admin"},{id:3,username:"other"}],[]]);
    await expect(caller().api.customAuth.login({username:"msrougi",password:"synthetic"})).rejects.toMatchObject({code:"FORBIDDEN"});
    expect(fixture.start).not.toHaveBeenCalled();
  });
  it("modo desligado não recebe solicitações e configuração não mistura os dois mecanismos",async()=>{
    vi.stubEnv("NATIVE_EMAIL_LOGIN","false");await expect(caller().api.customAuth.sendLoginCode({})).rejects.toMatchObject({code:"UNAUTHORIZED"});
    vi.stubEnv("NATIVE_EMAIL_LOGIN","true");vi.stubEnv("CF_ACCESS_ENABLED","true");expect(validateNetworkConfiguration).toThrow("NATIVE_EMAIL_LOGIN_MODE_CONFLICT");
    expect(maskLoginEmail("a@example.invalid")).toBe("a*****@example.invalid");
  });
  it("ignora as opções antigas da Bia no modo nativo sem dispensar o código",()=>{
    vi.stubEnv("BIA_DEVICE_ACCESS_ENABLED","true");
    vi.stubEnv("CF_ACCESS_BIA_USER_ID","9");
    vi.stubEnv("SROUGI_PUBLIC_ORIGIN","https://app.example.invalid");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN","https://fixture.cloudflareaccess.com");
    vi.stubEnv("CF_ACCESS_AUD","a".repeat(64));
    expect(validateNetworkConfiguration).not.toThrow();
  });
  it("logout expira o cookie intermediário na resposta HTTP real",async()=>{
    const app=express();
    app.post("/logout",async(req,res)=>{
      await appRouter.createCaller({user:null,req,res} as any).auth.logout();res.sendStatus(200);
    });
    const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
    try{
      const response=await fetch("http://127.0.0.1:"+(server.address() as {port:number}).port+"/logout",{method:"POST"});
      const cookie=response.headers.getSetCookie().find(c=>c.startsWith(NATIVE_PENDING_COOKIE+"="));
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
      expect(cookie).not.toMatch(/Max-Age=[1-9]/);
    }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
});
