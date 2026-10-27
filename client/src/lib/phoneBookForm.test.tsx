// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {cleanup,render,screen,fireEvent} from "@testing-library/react";
import {renderToString} from "react-dom/server";
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),error:vi.fn()}));
vi.mock("@/lib/trpc",()=>({trpc:{phoneBook:{
  create:{useMutation:()=>({mutate:api.create,isPending:false})},
  update:{useMutation:()=>({mutate:api.update,isPending:false})},
}}}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:api.error}}));
import PhoneBookForm from "../components/PhoneBookForm";
beforeEach(()=>vi.clearAllMocks());afterEach(cleanup);
const value=(label:string)=>(screen.getByLabelText(label) as HTMLInputElement).value;
describe("edição de contatos com campos ausentes",()=>{
  it("renderiza observações nulas antes de qualquer efeito, reproduzindo o erro relatado",()=>{
    const contact=Object.freeze({id:12,name:"Contato fictício",email:null,occupation:null,category:null,phone:null,observations:null});
    // Server rendering never runs useEffect: normalization must already exist.
    expect(renderToString(<PhoneBookForm initialData={contact}/>)).toContain("/2000 caracteres");
    render(<PhoneBookForm initialData={contact}/>);
    expect(value("Observações")).toBe("");expect(value("E-mail")).toBe("");
    expect(screen.getByText("0/2000 caracteres")).toBeTruthy();
    expect(contact.observations).toBeNull();expect(api.update).not.toHaveBeenCalled();
  });
  it("preenche também propriedades ausentes e permite salvar a edição",()=>{
    render(<PhoneBookForm initialData={{id:12,name:"Contato fictício"}}/>);
    fireEvent.change(screen.getByLabelText("Nome *"),{target:{value:"Contato atualizado"}});
    fireEvent.click(screen.getByRole("button",{name:"Atualizar Contato"}));
    expect(api.update).toHaveBeenCalledWith({id:12,data:{name:"Contato atualizado",email:undefined,occupation:undefined,category:undefined,phone:undefined,observations:undefined}});
    expect(api.create).not.toHaveBeenCalled();
  });
  it("preserva literalmente o conteúdo existente ao atualizar outro campo",()=>{
    const contact=Object.freeze({id:12,name:"Contato fictício",phone:"+55 (11) 1234 / ramal A",email:"fixture@example.invalid",occupation:"Ocupação",category:"Categoria",observations:"Linha 1\nLinha 2 — observações"});
    render(<PhoneBookForm initialData={contact}/>);
    fireEvent.change(screen.getByLabelText("Nome *"),{target:{value:"Novo nome"}});
    fireEvent.click(screen.getByRole("button",{name:"Atualizar Contato"}));
    const {id,...data}=contact;
    expect(api.update).toHaveBeenCalledWith({id,data:{...data,name:"Novo nome"}});
    expect(value("Observações")).toBe(contact.observations);
  });
  it("troca de contato limpa valores anteriores e mantém campos nulos seguros",()=>{
    const view=render(<PhoneBookForm initialData={{id:1,name:"Primeiro",observations:"Não transferir"}}/>);
    view.rerender(<PhoneBookForm initialData={{id:2,name:"Segundo",observations:null}}/>);
    expect(value("Nome *")).toBe("Segundo");expect(value("Observações")).toBe("");
    view.rerender(<PhoneBookForm initialData={null}/>);
    expect(value("Nome *")).toBe("");expect(screen.getByRole("button",{name:"Cadastrar Contato"})).toBeTruthy();
  });
  it("mantém validação de nome e cadastro de novos contatos",()=>{
    render(<PhoneBookForm/>);
    fireEvent.click(screen.getByRole("button",{name:"Cadastrar Contato"}));
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Nome *"),{target:{value:"Contato novo"}});
    fireEvent.click(screen.getByRole("button",{name:"Cadastrar Contato"}));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({name:"Contato novo"}));
    expect(api.update).not.toHaveBeenCalled();
  });
});
