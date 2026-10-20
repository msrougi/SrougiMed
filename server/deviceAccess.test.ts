import { beforeEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_ONLY_ERROR, isMobileRequest, requiresDesktop } from "../shared/deviceAccess";
import { assertDeviceAccess } from "./deviceAccess";
const database = vi.hoisted(() => ({ authenticateUser: vi.fn(), searchPatients: vi.fn(async () => ({items:[],total:0})) }));
vi.mock("./db", () => database);
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "synthetic-device-policy-test-key", isProduction: false } }));
import { appRouter } from "./routers";
const mobile={"user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1"};
const desktop={"user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_7) AppleWebKit/605.1.15 Safari/605.1.15"};
const session=(username:string|null,headers=mobile)=>{
  const cookie=vi.fn(),clearCookie=vi.fn();
  return {cookie,clearCookie,caller:appRouter.createCaller({user:username?{id:1,username,role:"user"}:null,req:{headers,protocol:"https"},res:{cookie,clearCookie}} as any)};
};
beforeEach(()=>vi.clearAllMocks());
describe("restrição de dispositivo por conta",()=>{
  it.each(["bia","BIA"," Bia "])("restringe somente o login %s",username=>{
    expect(requiresDesktop(username)).toBe(true);
    expect(()=>assertDeviceAccess({username},mobile)).toThrow(DESKTOP_ONLY_ERROR);
    expect(()=>assertDeviceAccess({username},desktop)).not.toThrow();
  });
  it.each(["admin","teste","rose","ROSE","roseli","bianca",null])("mantém outras contas liberadas: %s",username=>{
    expect(requiresDesktop(username)).toBe(false);
    expect(()=>assertDeviceAccess({username},mobile)).not.toThrow();
  });
  it.each([
    {"user-agent":"Android 14; Tablet"},
    {"user-agent":"Macintosh Mobile/15E148"},
    {"sec-ch-ua-mobile":"?1"},
    {"user-agent":"Macintosh","x-srougi-device":"mobile"},
    {"user-agent":"Android Mobile","x-srougi-device":"desktop"},
  ])("identifica telefone/tablet sem permitir que a dica desktop anule o agente móvel",headers=>{
    expect(isMobileRequest(headers)).toBe(true);
  });
  it("bloqueia login móvel antes de emitir sessão e permite pelo computador",async()=>{
    database.authenticateUser.mockResolvedValue({id:1,username:"bia",name:"Fixture",role:"user"});
    const phone=session(null);await expect(phone.caller.customAuth.login({username:"bia",password:"synthetic"})).rejects.toMatchObject({code:"FORBIDDEN",message:DESKTOP_ONLY_ERROR});
    expect(phone.cookie).not.toHaveBeenCalled();
    const computer=session(null,desktop);await expect(computer.caller.customAuth.login({username:"bia",password:"synthetic"})).resolves.toMatchObject({success:true});
    expect(computer.cookie).toHaveBeenCalledOnce();
  });
  it("bloqueia sessões já abertas nos dados, sessão pública, chat e administração",async()=>{
    const s=session("bia");
    for(const request of [()=>s.caller.patients.searchPage({name:"Fixture"}),()=>s.caller.customAuth.getCurrentUser(),()=>s.caller.auth.me(),()=>s.caller.chatMed.threads(),()=>s.caller.admin.listUsers()]) {
      await expect(request()).rejects.toMatchObject({code:"FORBIDDEN",message:DESKTOP_ONLY_ERROR});
    }
    expect(database.searchPatients).not.toHaveBeenCalled();
  });
  it("permite sair ou trocar para outra conta num aparelho bloqueado",async()=>{
    const s=session("bia");await expect(s.caller.auth.logout()).resolves.toMatchObject({success:true});expect(s.clearCookie).toHaveBeenCalledOnce();
    database.authenticateUser.mockResolvedValue({id:2,username:"teste",name:"Fixture",role:"user"});
    await expect(s.caller.customAuth.login({username:"teste",password:"synthetic"})).resolves.toMatchObject({success:true});
    expect(s.cookie).toHaveBeenCalledOnce();
  });
  it("preserva busca para conta restrita no computador",async()=>{
    await expect(session("bia",desktop).caller.patients.searchPage({name:"Fixture"})).resolves.toMatchObject({total:0});
    expect(database.searchPatients).toHaveBeenCalledOnce();
  });
});
