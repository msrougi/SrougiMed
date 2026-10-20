import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import jwt from "jsonwebtoken";
const fixtures=vi.hoisted(()=>({authenticateUser:vi.fn(),begin:vi.fn(),verify:vi.fn(),create:vi.fn(),revoke:vi.fn()}));
vi.mock("./db",()=>({authenticateUser:fixtures.authenticateUser}));
vi.mock("./loginEmailCode",()=>({beginNetworkLogin:fixtures.begin,emailCodeStore:async()=>({verify:fixtures.verify})}));
vi.mock("./trustedDevices",async(importOriginal)=>({...await importOriginal<typeof import("./trustedDevices")>(),trustedDeviceStore:async()=>({create:fixtures.create,revoke:fixtures.revoke})}));
vi.mock("./_core/env",()=>({ENV:{cookieSecret:"synthetic-network-route-key",isProduction:false}}));
import {appRouter} from "./routers";
const user={id:1,username:"rose",name:"Fixture",role:"user",password:"private-synthetic-hash"};
const session=()=>{
  const cookie=vi.fn();
  return {cookie,caller:appRouter.createCaller({user:null,req:{headers:{"user-agent":"Fixture"},protocol:"https"},res:{cookie}} as any)};
};
beforeEach(()=>{vi.clearAllMocks();fixtures.authenticateUser.mockResolvedValue(user);fixtures.begin.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllEnvs());
describe("login em duas etapas",()=>{
  it("não emite sessão após senha enquanto aguarda o código",async()=>{
    const challenge={success:false,requiresCode:true,challengeId:"a".repeat(64),emailHint:"f***@example.invalid",expiresIn:300};
    fixtures.begin.mockResolvedValue(challenge);const s=session();
    await expect(s.caller.customAuth.login({username:"rose",password:"synthetic"})).resolves.toEqual(challenge);
    expect(s.cookie).not.toHaveBeenCalled();
  });
  it("só emite sessão com a prova retornada pela confirmação",async()=>{
    const proof={emailCodeAt:123,emailCodeIp:"198.51.100.2",emailCodeAgent:"fixture",emailCodeAccount:"fixture"};
    fixtures.verify.mockResolvedValue({user,proof});const s=session();
    const result=await s.caller.customAuth.verifyLoginCode({challengeId:"a".repeat(64),code:"123456"});
    expect(result).toMatchObject({success:true,requiresCode:false});expect(result.user).not.toHaveProperty("password");
    expect(jwt.verify(s.cookie.mock.calls[0][1],"synthetic-network-route-key")).toMatchObject({userId:1,...proof});
  });
  it("falha de código ou de entrega não emite sessão",async()=>{
    fixtures.verify.mockRejectedValue(Error("invalid synthetic code"));const s=session();
    await expect(s.caller.customAuth.verifyLoginCode({challengeId:"a".repeat(64),code:"123456"})).rejects.toThrow();
    fixtures.begin.mockRejectedValue(Error("synthetic delivery failure"));
    await expect(s.caller.customAuth.login({username:"rose",password:"synthetic"})).rejects.toThrow();expect(s.cookie).not.toHaveBeenCalled();
  });
  it("preserva login normal sem código e rejeita senha inválida antes de enviar",async()=>{
    const s=session();await expect(s.caller.customAuth.login({username:"rose",password:"synthetic"})).resolves.toMatchObject({success:true,requiresCode:false});
    expect(s.cookie).toHaveBeenCalledOnce();vi.clearAllMocks();fixtures.authenticateUser.mockResolvedValue(null);
    await expect(s.caller.customAuth.login({username:"rose",password:"invalid"})).rejects.toThrow("Usuário ou senha inválidos");expect(fixtures.begin).not.toHaveBeenCalled();
  });
  it("só grava confiança após verificar código e emite cookie protegido",async()=>{
    vi.stubEnv("SECOND_FACTOR_ENABLED","true");
    fixtures.create.mockResolvedValue({id:"b".repeat(64),token:"synthetic-device-token"});
    fixtures.verify.mockResolvedValue({user,proof:{emailCodeAt:123,emailCodeIp:"",emailCodeAgent:"fixture",emailCodeAccount:"fixture"}});
    const s=session();await s.caller.customAuth.verifyLoginCode({challengeId:"a".repeat(64),code:"123456",trustDevice:true});
    expect(fixtures.create).toHaveBeenCalledOnce();
    expect(s.cookie).toHaveBeenCalledWith("__Host-srougi_trusted","synthetic-device-token",expect.objectContaining({httpOnly:true,secure:true,sameSite:"strict",maxAge:30*86400000}));
    const app=s.cookie.mock.calls.find(c=>c[0]==="app_session_id");
    expect(jwt.verify(app![1],"synthetic-network-route-key")).toHaveProperty("trustedDeviceId","b".repeat(64));
  });
  it("senha continua obrigatória mesmo se begin retornar dispositivo confiável",async()=>{
    fixtures.begin.mockResolvedValue({trustedProof:{emailCodeAt:123,emailCodeIp:"",emailCodeAgent:"fixture",emailCodeAccount:"fixture",trustedDeviceId:"b".repeat(64)}});
    const s=session();await s.caller.customAuth.login({username:"rose",password:"synthetic"});
    expect(fixtures.authenticateUser).toHaveBeenCalledWith("rose","synthetic");
    expect(s.cookie).toHaveBeenCalledOnce();
  });
  it("somente administrador pode revogar confiança",async()=>{
    const userCaller=appRouter.createCaller({user,req:{headers:{}},res:{}} as any);
    await expect(userCaller.admin.revokeTrustedDevices({userId:2})).rejects.toMatchObject({code:"FORBIDDEN"});
    const adminCaller=appRouter.createCaller({user:{...user,role:"admin"},req:{headers:{}},res:{}} as any);
    await adminCaller.admin.revokeTrustedDevices({userId:2});
    expect(fixtures.revoke).toHaveBeenCalledWith(2);
  });
});
