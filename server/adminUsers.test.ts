import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() => ({ updateManagedUser: vi.fn(async () => ({ success: true })) }));
vi.mock("./db", () => database);
import { appRouter } from "./routers";

const input = { id: 2, username: "contato", name: "Nome", email: "nome@example.com", role: "user" as const };
const caller = (role: "admin" | "user" | null) => appRouter.createCaller({ user: role ? { id: 1, role, password: "hash-privado", name: "Administrador" } : null, req: {}, res: {} } as any);

beforeEach(() => vi.clearAllMocks());
describe("edição administrativa de usuários", () => {
  it("permite ao administrador editar dados e enviar nova senha opcional", async () => {
    await expect(caller("admin").admin.updateUser({ ...input, username: " contato ", newPassword: "senha-nova-123" })).resolves.toEqual({ success: true });
    expect(database.updateManagedUser).toHaveBeenCalledWith({ ...input, newPassword: "senha-nova-123" });
  });
  it("bloqueia usuário comum e sessão anônima antes de alterar o banco", async () => {
    for (const role of ["user", null] as const) {
      await expect(caller(role).admin.updateUser(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(database.updateManagedUser).not.toHaveBeenCalled();
  });
  it("valida login, e-mail e senha antes de alterar o banco", async () => {
    for (const invalid of [{username:" "},{email:"invalido"},{newPassword:"curta"},{newPassword:"🙂".repeat(19)}]) {
      await expect(caller("admin").admin.updateUser({ ...input, ...invalid })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(database.updateManagedUser).not.toHaveBeenCalled();
  });
  it("impede remover o próprio acesso administrativo", async () => {
    await expect(caller("admin").admin.updateUser({ ...input, id: 1 })).rejects.toThrow("próprio acesso");
    expect(database.updateManagedUser).not.toHaveBeenCalled();
  });
  it("não expõe o hash de senha nas consultas de sessão", async () => {
    for (const user of [await caller("admin").auth.me(), await caller("admin").customAuth.getCurrentUser()]) {
      expect(user).toMatchObject({ id: 1, name: "Administrador" });
      expect(user).not.toHaveProperty("password");
    }
  });
});
