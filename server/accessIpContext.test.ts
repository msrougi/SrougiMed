import {beforeEach,describe,expect,it,vi} from "vitest";
const fixtures=vi.hoisted(()=>({authenticate:vi.fn(),oauth:vi.fn(),record:vi.fn()}));
vi.mock("./db",()=>({authenticateCustomToken:fixtures.authenticate}));
vi.mock("./_core/sdk",()=>({sdk:{authenticateRequest:fixtures.oauth}}));
vi.mock("./accessIpLog",()=>({recordAccessIp:fixtures.record}));
import {createContext} from "./_core/context";
beforeEach(()=>{vi.clearAllMocks();fixtures.oauth.mockResolvedValue(null);});
describe("coleta em sessões existentes",()=>{
  it("registra origem da sessão válida sem exigir novo login",async()=>{
    const user={id:7,username:"Gislene"};fixtures.authenticate.mockResolvedValue(user);
    const req={headers:{cookie:"app_session_id=synthetic"}};const context=await createContext({req,res:{}} as any);
    expect(context.user).toEqual(user);expect(fixtures.record).toHaveBeenCalledWith(user,req);
  });
  it("não atribui acesso anônimo ou sessão inválida a um usuário",async()=>{
    fixtures.authenticate.mockResolvedValue(null);
    await createContext({req:{headers:{}},res:{}} as any);
    await createContext({req:{headers:{cookie:"app_session_id=invalid"}},res:{}} as any);
    expect(fixtures.record).not.toHaveBeenCalled();
  });
});
