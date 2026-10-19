import { beforeEach, describe, expect, it, vi } from "vitest";
import { changePasswordSchema, passwordRequirements } from "../shared/changePassword";
const database = vi.hoisted(() => ({ changeOwnPassword: vi.fn(async () => ({ success: true })) }));
vi.mock("./db", () => database);
import { appRouter } from "./routers";
const input = { currentPassword: "existing-fixture", newPassword: "NovaSenha123", confirmPassword: "NovaSenha123" };
const caller = (role: "admin" | "user" | null) => appRouter.createCaller({ user: role ? { id: 7, role } : null, req: {}, res: {} } as any);
beforeEach(() => vi.clearAllMocks());

describe("troca da própria senha", () => {
  it.each(["admin", "user"] as const)("permite ao perfil %s somente o ID da sessão", async role => {
    await expect(caller(role).customAuth.changePassword(input)).resolves.toEqual({ success: true });
    expect(database.changeOwnPassword).toHaveBeenCalledWith(7, input);
  });
  it("bloqueia sessão anônima e tentativa de escolher outra conta", async () => {
    await expect(caller(null).customAuth.changePassword(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller("user").customAuth.changePassword({ ...input, userId: 9 } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.changeOwnPassword).not.toHaveBeenCalled();
  });
  it.each(["Ab1", "semmaiuscula123", "SemNumeroAqui", "12345678", "🙂".repeat(19)+"Aa1"])("rejeita senha fora da política: caso %s", async password => {
    await expect(caller("user").customAuth.changePassword({ ...input, newPassword: password, confirmPassword: password })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.changeOwnPassword).not.toHaveBeenCalled();
  });
  it("rejeita confirmação diferente e reutilização da senha atual", () => {
    expect(changePasswordSchema.safeParse({ ...input, confirmPassword: "OutraSenha123" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...input, currentPassword: input.newPassword }).success).toBe(false);
  });
  it("compartilha validação em tempo real e servidor, inclusive letras acentuadas", () => {
    expect(passwordRequirements("Árvore123").every(rule => rule.valid)).toBe(true);
    expect(changePasswordSchema.safeParse({ ...input, newPassword: "Árvore123", confirmPassword: "Árvore123" }).success).toBe(true);
  });
});
