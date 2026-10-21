// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
const api=vi.hoisted(()=>({login:vi.fn(),verify:vi.fn(),send:vi.fn(),navigate:vi.fn(),clear:vi.fn(),success:vi.fn(),error:vi.fn(),loginOptions:null as any,verifyOptions:null as any,sendOptions:null as any}));
vi.mock("@/lib/trpc",()=>({trpc:{customAuth:{
  login:{useMutation:(options:any)=>{api.loginOptions=options;return {mutate:api.login};}},
  verifyLoginCode:{useMutation:(options:any)=>{api.verifyOptions=options;return {mutate:api.verify};}},
  sendLoginCode:{useMutation:(options:any)=>{api.sendOptions=options;return {mutate:api.send};}},
}}}));
vi.mock("@tanstack/react-query",()=>({useQueryClient:()=>({clear:api.clear})}));
vi.mock("wouter",()=>({useLocation:()=>["/",api.navigate]}));
vi.mock("sonner",()=>({toast:{success:api.success,error:api.error}}));
vi.mock("@/components/ThemeSwitcher",()=>({default:()=>null}));
import Login from "../pages/Login";
afterEach(()=>{cleanup();vi.useRealTimers();});
beforeEach(()=>vi.clearAllMocks());
function challenge(){act(()=>api.loginOptions.onSuccess({requiresCode:true,challengeId:"a".repeat(64),emailHint:"f***@example.invalid",trustAvailable:true}));}
describe("tela de confirmação por e-mail",()=>{
  it("mostra o destinatário mascarado sem pedir e-mail e só envia quando solicitado",()=>{
    render(<Login/>);
    fireEvent.change(screen.getByLabelText("Senha"),{target:{value:"synthetic"}});
    act(()=>api.loginOptions.onSuccess({requiresCode:false,requiresSendCode:true,emailHint:"fi*****@example.invalid"}));
    expect(screen.getByRole("heading",{name:"Confirme seu acesso"})).toBeTruthy();
    expect(screen.getByText("fi*****@example.invalid")).toBeTruthy();
    expect(screen.queryByLabelText("E-mail")).toBeNull();expect(api.send).not.toHaveBeenCalled();expect(api.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Enviar código"}));expect(api.send).toHaveBeenCalledWith({});
    act(()=>api.sendOptions.onError({message:"Não foi possível enviar o código"}));
    expect(screen.getByRole("button",{name:"Enviar código"})).toBeTruthy();expect(api.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Voltar ao login / solicitar novo código"}));
    expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe("");
  });
  it("só informa código enviado após aceitação e mantém reenvio em espera por um minuto",()=>{
    vi.useFakeTimers();render(<Login/>);
    act(()=>api.loginOptions.onSuccess({requiresCode:false,requiresSendCode:true,emailHint:"fi*****@example.invalid"}));
    fireEvent.click(screen.getByRole("button",{name:"Enviar código"}));
    act(()=>api.sendOptions.onSuccess({challengeId:"a".repeat(64),emailHint:"fi*****@example.invalid",trustAvailable:true,resendAvailable:true}));
    expect(screen.getByLabelText("Código de acesso")).toBeTruthy();
    expect(screen.getByText(/Enviamos um código/)).toBeTruthy();
    expect((screen.getByRole("button",{name:"Reenviar código"}) as HTMLButtonElement).disabled).toBe(true);
    act(()=>vi.advanceTimersByTime(60000));
    fireEvent.click(screen.getByRole("button",{name:"Reenviar código"}));expect(api.send).toHaveBeenCalledTimes(2);
    act(()=>api.sendOptions.onSuccess({challengeId:"b".repeat(64),emailHint:"fi*****@example.invalid",trustAvailable:true,resendAvailable:true}));
    fireEvent.change(screen.getByLabelText("Código de acesso"),{target:{value:"123456"}});
    fireEvent.click(screen.getByRole("button",{name:"Verificar código"}));
    expect(api.verify).toHaveBeenCalledWith({challengeId:"b".repeat(64),code:"123456",trustDevice:true});
  });
  it("mantém o usuário no login até confirmar o código e limpa a senha",()=>{
    render(<Login/>);fireEvent.change(screen.getByLabelText("Usuário"),{target:{value:"rose"}});fireEvent.change(screen.getByLabelText("Senha"),{target:{value:"synthetic"}});
    fireEvent.click(screen.getByRole("button",{name:"Entrar"}));expect(api.login).toHaveBeenCalledWith({username:"rose",password:"synthetic"});
    challenge();expect(api.navigate).not.toHaveBeenCalled();expect(api.clear).not.toHaveBeenCalled();expect(screen.getByText(/f\*\*\*@example.invalid/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Código de acesso"),{target:{value:"12a3456"}});fireEvent.click(screen.getByRole("button",{name:"Verificar código"}));
    expect(api.verify).toHaveBeenCalledWith({challengeId:"a".repeat(64),code:"123456",trustDevice:true});
    act(()=>api.verifyOptions.onSuccess({success:true}));expect(api.clear).toHaveBeenCalledOnce();expect(api.navigate).toHaveBeenCalledWith("/dashboard");
  });
  it("informa erro sem navegar e permite solicitar novo código com senha novamente",()=>{
    render(<Login/>);challenge();fireEvent.change(screen.getByLabelText("Código de acesso"),{target:{value:"123456"}});fireEvent.click(screen.getByRole("button",{name:"Verificar código"}));
    act(()=>api.verifyOptions.onError({message:"Código inválido ou expirado"}));expect(api.error).toHaveBeenCalledWith("Código inválido ou expirado");expect(api.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Voltar ao login / solicitar novo código"}));expect((screen.getByLabelText("Senha") as HTMLInputElement).value).toBe("");
  });
  it("confiança de 30 dias começa marcada e permite desmarcar",()=>{
    render(<Login/>);challenge();
    const checkbox=screen.getByRole("checkbox");
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    fireEvent.change(screen.getByLabelText("Código de acesso"),{target:{value:"123456"}});
    fireEvent.click(screen.getByRole("button",{name:"Verificar código"}));
    expect(api.verify).toHaveBeenCalledWith({challengeId:"a".repeat(64),code:"123456",trustDevice:false});
  });
});
