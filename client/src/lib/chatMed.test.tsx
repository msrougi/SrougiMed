// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
const api=vi.hoisted(()=>({history:vi.fn(),send:vi.fn(),read:vi.fn(),refetch:vi.fn(),data:null as any}));
vi.mock("@/lib/trpc",async()=>{
  const {useState}=await import("react");
  return {trpc:{
    useUtils:()=>({client:{chatMed:{history:{query:api.history}}}}),
    chatMed:{
      threads:{useQuery:()=>({data:api.data,error:null,isLoading:false,refetch:api.refetch})},
      read:{useMutation:()=>({mutate:(input:any,options:any)=>{api.read(input);options?.onSuccess();}})},
      send:{useMutation:()=>{
        const [error,setError]=useState<Error|null>(null);
        const [isPending,setPending]=useState(false);
        return {error,isPending,mutateAsync:async(input:any)=>{
          setPending(true);setError(null);
          try{return await api.send(input);}catch(error){setError(error as Error);throw error;}finally{setPending(false);}
        }};
      }},
    },
  }};
});
import ChatMed,{mergeChatMessages} from "../components/ChatMed";
const first={id:1,senderId:2,senderName:"Colega fictícia",text:"Olá, equipe",createdAt:new Date("2026-10-19T10:00:00Z")};
beforeEach(()=>{
  vi.clearAllMocks();
  api.data={group:"equipe",unread:2,threads:[{peerId:null,name:"equipe",unread:1,lastMessage:"Olá, equipe",lastAt:first.createdAt},{peerId:2,name:"Colega fictícia",unread:1,lastMessage:null,lastAt:null}]};
  api.history.mockImplementation(async input=>({messages:input.afterId?[]:[first],hasMore:false}));
  api.send.mockImplementation(async input=>({...first,id:2,senderId:1,senderName:"Você",text:input.text}));
});
afterEach(cleanup);
async function openConversation(name="# equipe") {
  fireEvent.click(screen.getByRole("button",{name:/Abrir ChatMed/}));
  fireEvent.click(screen.getByRole("button",{name:new RegExp(name)}));
  await screen.findByRole("log");
  await waitFor(()=>expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).disabled).toBe(false));
}
describe("janela ChatMed",()=>{
  it("lista canal, colegas e contador; abre histórico e marca leitura",async()=>{
    render(<ChatMed userId={1}/>);await openConversation();
    expect(screen.getByRole("log").textContent).toContain("Olá, equipe");
    expect(api.history).toHaveBeenCalledWith({group:"equipe",peerId:null});
    await waitFor(()=>expect(api.read).toHaveBeenCalledWith({group:"equipe",peerId:null,lastSeenId:1}));
    fireEvent.click(screen.getByRole("button",{name:"Voltar às conversas"}));
    fireEvent.click(screen.getByRole("button",{name:/Colega fictícia/}));
    await waitFor(()=>expect(api.history).toHaveBeenCalledWith({group:"equipe",peerId:2}));
    expect(screen.getByText("Conversa privada entre vocês")).toBeTruthy();
  });
  it("envia texto literal, não interpreta HTML e mantém texto após falha com reenvio idempotente",async()=>{
    api.send.mockRejectedValueOnce(new Error("Sem conexão"));
    render(<ChatMed userId={1}/>);await openConversation();
    fireEvent.change(screen.getByLabelText("Mensagem"),{target:{value:"<script>exemplo</script>"}});
    fireEvent.click(screen.getByRole("button",{name:"Enviar mensagem"}));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("<script>exemplo</script>");
    fireEvent.click(screen.getByRole("button",{name:"Tentar novamente"}));
    await screen.findByText("<script>exemplo</script>");
    expect(api.send.mock.calls[0][0].clientId).toBe(api.send.mock.calls[1][0].clientId);
    expect(screen.getByRole("log").querySelector("script")).toBeNull();
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("");
  });
  it("orienta quem está sem grupo e não consulta histórico",()=>{
    api.data={group:null,threads:[],unread:0};render(<ChatMed userId={1}/>);
    fireEvent.click(screen.getByRole("button",{name:/Abrir ChatMed/}));
    expect(screen.getByText("Seu grupo ainda não foi configurado.")).toBeTruthy();
    expect(api.history).not.toHaveBeenCalled();
  });
  it("une páginas e incrementos sem duplicar mensagens nem mudar a ordem",()=>{
    expect(mergeChatMessages([{...first,id:3},first],[{...first,id:2},first]).map(message=>message.id)).toEqual([1,2,3]);
  });
});
