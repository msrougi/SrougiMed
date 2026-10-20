// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
const api=vi.hoisted(()=>({login:vi.fn(),verify:vi.fn(),navigate:vi.fn(),clear:vi.fn(),success:vi.fn(),error:vi.fn(),loginOptions:null as any,verifyOptions:null as any}));
vi.mock("@/lib/trpc",()=>({trpc:{customAuth:{
  login:{useMutation:(options:any)=>{api.loginOptions=options;return {mutate:api.login};}},
  verifyLoginCode:{useMutation:(options:any)=>{api.verifyOptions=options;return {mutate:api.verify};}},
}}}));
vi.mock("@tanstack/react-query",()=>({useQueryClient:()=>({clear:api.clear})}));
vi.mock("wouter",()=>({useLocation:()=>["/",api.navigate]}));
vi.mock("sonner",()=>({toast:{success:api.success,error:api.error}}));
vi.mock("@/components/ThemeSwitcher",()=>({default:()=>null}));
import Login from "../pages/Login";
afterEach(cleanup);
beforeEach(()=>vi.clearAllMocks());
function challenge(){act(()=>api.loginOptions.onSuccess({requiresCode:true,challengeId:"a".repeat(64),emailHint:"f***@example.invalid"}));}
describe("tela de confirmação por e-mail",()=>{
  it("mantém o usuário no login até confirmar o código e limpa a senha",()=>{
    render(<Login/>);fireEvent.change(screen.getByLabelText("Usuário"),{target:{value:"rose"}});fireEvent.change(screen.getByLabelText("Senha"),{target:{value:"synthetic"}});
    fireEvent.click(screen.getByRole("button",{name:"Entrar"}));expect(api.login).toHaveBeenCalledWith({username:"rose",password:"synthetic"});
    challenge();expect(api.navigate).not.toHaveBeenCalled();expect(api.clear).not.toHaveBeenCalled();expect(screen.getByText(/f\*\*\*@example.invalid/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Código de acesso"),{target:{value:"12a3456"}});fireEvent.click(screen.getByRole("button",{name:"Verificar código"}));
    expect(api.verify).toHaveBeenCalledWith({challengeId:"a".repeat(64),code:"123456"});
    act(()=>api.verifyOptions.onSuccess({success:true}));expect(api.clear).toHaveBeenCalledOnce();expect(api.navigate).toHaveBeenCalledWith("/dashboard");
  });
  it("informa erro sem navegar e permite solicitar novo código com senha novamente",()=>{
    render(<Login/>);challenge();fireEvent.change(screen.getByLabelText("Código de acesso"),{target:{value:"123456"}});fireEvent.click(screen.getByRole("button",{name:"Verificar código"}));
    act(()=>api.verifyOptions.onError({message:"Código inválido ou expirado"}));expect(api.error).toHaveBeenCalledWith("Código inválido ou expirado");expect(api.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Voltar ao login / solicitar novo código"}));expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe("");
  });
});
