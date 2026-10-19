import { beforeEach, describe, expect, it, vi } from "vitest";
import { compare } from "bcryptjs";
const db = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), update: vi.fn(), set: vi.fn(), write: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => db }));
import { getAllUsers, updateManagedUser } from "./db";

const input = { id: 2, username: "login", name: "Novo nome", email: "novo@example.com", role: "user" as const };
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://unused/test");
  vi.clearAllMocks();
  db.select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ id: 2 }] }) }) }) });
  db.transaction.mockImplementation(async callback => callback(db));
  db.update.mockReturnValue({ set: db.set });
  db.set.mockReturnValue({ where: db.write });
  db.write.mockResolvedValue(undefined);
});

describe("persistência da edição de usuários", () => {
  it("mantém a senha existente quando não foi informada nova senha", async () => {
    await expect(updateManagedUser(input)).resolves.toEqual({ success: true });
    expect(db.set).toHaveBeenCalledWith({ username: input.username, name: input.name, email: input.email, role: input.role });
    expect(db.set.mock.calls[0][0]).not.toHaveProperty("password");
  });
  it("grava a nova senha com bcrypt, nunca em texto puro", async () => {
    const password = "senha-nova-123";
    await updateManagedUser({ ...input, newPassword: password });
    const written = db.set.mock.calls[0][0].password;
    expect(written).not.toBe(password);
    expect(await compare(password, written)).toBe(true);
  });
  it("permite limpar nome e e-mail sem alterar campos internos", async () => {
    await updateManagedUser({ ...input, name: "", email: "" });
    expect(db.set).toHaveBeenCalledWith({ username: input.username, name: null, email: null, role: input.role });
  });
  it("rejeita usuário removido e login duplicado com mensagens próprias", async () => {
    db.select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [] }) }) }) });
    await expect(updateManagedUser(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.set).not.toHaveBeenCalled();
    db.write.mockRejectedValueOnce({ cause: { code: "ER_DUP_ENTRY" } });
    await expect(updateManagedUser(input)).rejects.toMatchObject({ code: "CONFLICT", message: "Este login já está em uso" });
  });
  it("não seleciona hashes ao listar usuários", async () => {
    db.select.mockReturnValueOnce({ from: async () => [] });
    await getAllUsers();
    expect(db.select.mock.calls[0][0]).toHaveProperty("username");
    expect(db.select.mock.calls[0][0]).not.toHaveProperty("password");
  });
});
