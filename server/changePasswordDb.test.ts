import { beforeEach, describe, expect, it, vi } from "vitest";
import { compare, hash } from "bcryptjs";
const database = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), update: vi.fn(), set: vi.fn(), write: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => database }));
import { changeOwnPassword } from "./db";
const input = { currentPassword: "FixtureAtual123", newPassword: "FixtureNova123", confirmPassword: "FixtureNova123" };
beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", "mysql://unused/test"); vi.clearAllMocks();
  const password = await hash(input.currentPassword, 4);
  database.select.mockReturnValue({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ password }] }) }) }) });
  database.transaction.mockImplementation(async callback => callback(database));
  database.update.mockReturnValue({ set: database.set });
  database.set.mockReturnValue({ where: database.write });
});
describe("gravação da própria senha", () => {
  it("confere a senha atual e grava exclusivamente um hash bcrypt novo", async () => {
    await expect(changeOwnPassword(7, input)).resolves.toEqual({ success: true });
    const changes = database.set.mock.calls[0][0];
    expect(Object.keys(changes)).toEqual(["password"]);
    expect(changes.password).not.toBe(input.newPassword);
    expect(await compare(input.newPassword, changes.password)).toBe(true);
    expect(await compare(input.currentPassword, changes.password)).toBe(false);
  });
  it("recusa senha atual incorreta sem gravar", async () => {
    await expect(changeOwnPassword(7, { ...input, currentPassword: "incorreta" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Senha atual incorreta" });
    expect(database.set).not.toHaveBeenCalled();
  });
  it("recusa conta sem senha local sem gravar", async () => {
    database.select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [{ password: null }] }) }) }) });
    await expect(changeOwnPassword(7, input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.set).not.toHaveBeenCalled();
  });
});
