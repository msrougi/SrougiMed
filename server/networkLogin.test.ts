import {beforeEach,describe,expect,it,vi} from "vitest";
import jwt from "jsonwebtoken";
const fixtures=vi.hoisted(()=>({authenticateUser:vi.fn(),begin:vi.fn(),verify:vi.fn()}));
vi.mock("./db",()=>({authenticateUser:fixtures.authenticateUser}));
vi.mock("./loginEmailCode",()=>({beginNetworkLogin:fixtures.begin,emailCodeStore:async()=>({verify:fixtures.verify})}));
vi.mock("./_core/env",()=>({ENV:{cookieSecret:"synthetic-network-route-key",isProduction:false}}));
import {appRouter} from "./routers";
const user={id:1,username:"rose",name:"Fixture",role:"user",password:"private-synthetic-hash"};
const session=()=>{
  const cookie=vi.fn();
  return {cookie,caller:appRouter.createCaller({user:null,req:{headers:{"user-agent":"Fixture"},protocol:"https"},res:{cookie}} as any)};
};
beforeEach(()=>{vi.clearAllMocks();fixtures.authenticateUser.mockResolvedValue(user);fixtures.begin.mockResolvedValue(null);});
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
});
