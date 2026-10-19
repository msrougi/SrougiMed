import { describe,expect,it,vi,beforeEach } from "vitest";
import { chatGroupSchema, chatSendSchema, chatHistorySchema } from "../shared/chatMed";
import { updateUserSchema } from "../shared/userManagement";
const db = vi.hoisted(() => ({ getDb: vi.fn(), updateManagedUser: vi.fn(async () => ({ success: true })), createUser: vi.fn() }));
vi.mock("./db", () => db);
import { appRouter } from "./routers";
const caller = (id?: number,role="user") => appRouter.createCaller({user: id ? { id,role } : null,req: {},res: {}} as any);
const thread = { group: "equipe",peerId: 2 };
beforeEach(() => vi.clearAllMocks());

describe("contratos e permissões do ChatMed", () => {
  it("normaliza o grupo no cadastro e na edição", () => {
    expect(chatGroupSchema.parse("  EQUIPE   Clínica  ")).toBe("equipe clínica");
    expect(chatGroupSchema.parse("  ")).toBe("");
    expect(updateUserSchema.parse({id:2,username:"fixture",name:"Fixture",email:"",role:"user",chatGroup:" EQUIPE "}).chatGroup).toBe("equipe");
    for (const value of ["x".repeat(61),"<script>","grupo/segredo"]) expect(chatGroupSchema.safeParse(value).success).toBe(false);
  });
  it("rejeita mensagem vazia, texto excessivo e identificadores inválidos", () => {
    const base={...thread,text:"  Olá, equipe!  ",clientId:"d14d7929-51ee-4a63-9479-1eadf8070666"};
    expect(chatSendSchema.parse(base).text).toBe("Olá, equipe!");
    for (const invalid of [{text:" "},{text:"x".repeat(4001)},{clientId:"x"},{peerId:0},{group:""},{senderId:9}]) expect(chatSendSchema.safeParse({...base,...invalid}).success).toBe(false);
    expect(chatHistorySchema.safeParse({...thread,beforeId:5,afterId:1}).success).toBe(false);
  });
  it("bloqueia todas as operações de chat sem sessão", async () => {
    const anon=caller();
    for (const request of [()=>anon.chatMed.threads(),()=>anon.chatMed.history(thread),()=>anon.chatMed.read({...thread,lastSeenId:1}),()=>anon.chatMed.send({...thread,text:"Olá",clientId:"d14d7929-51ee-4a63-9479-1eadf8070666"})]) {
      await expect(request()).rejects.toMatchObject({code:"UNAUTHORIZED"});
    }
    expect(db.getDb).not.toHaveBeenCalled();
  });
  it("só o administrador configura o grupo e aceita limpar a configuração", async () => {
    const input={id:2,username:"fixture",name:"Fixture",email:"",role:"user" as const,chatGroup:" EQUIPE "};
    await expect(caller(1).admin.updateUser(input)).rejects.toMatchObject({code:"FORBIDDEN"});
    await caller(1,"admin").admin.updateUser(input);
    expect(db.updateManagedUser).toHaveBeenLastCalledWith({...input,chatGroup:"equipe"});
    await caller(1,"admin").admin.updateUser({...input,chatGroup:""});
    expect(db.updateManagedUser).toHaveBeenLastCalledWith({...input,chatGroup:""});
  });
  it("o grupo também pode ser definido na criação de usuário pelo administrador", async () => {
    const input={username:"fixture",password:"Fixture123",name:"Fixture",role:"user" as const,chatGroup:" EQUIPE "};
    await expect(caller(1).admin.createUser(input)).rejects.toMatchObject({code:"FORBIDDEN"});
    await caller(1,"admin").admin.createUser(input);
    expect(db.createUser).toHaveBeenCalledWith({...input,chatGroup:"equipe"});
  });
});
