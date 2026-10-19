import { describe, expect, it, vi } from "vitest";
vi.mock("./db", () => ({ importPatients: vi.fn(async () => ({ successCount: 1 })) }));
import { appRouter } from "./routers";

function caller(role: "user" | "admin" | null) {
  return appRouter.createCaller({ user: role ? { id: 1, role } : null, req: {}, res: {} } as any);
}

describe("Acesso à importação", () => {
  it("administrador pode importar somente nome, sem inventar dados obrigatórios", async () => {
    await expect(caller("admin").importData.importPatients([{ name: "Teste" }])).resolves.toEqual({ successCount: 1 });
  });
  it("usuário comum e sessão anônima não podem importar", async () => {
    await expect(caller("user").importData.importPatients([{ name: "Teste" }])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(null).importData.importPatients([{ name: "Teste" }])).rejects.toThrow();
  });
  it("cadastro novo continua exigindo os campos atuais", async () => {
    await expect(caller("admin").patients.create({ name: "Teste" } as any)).rejects.toThrow();
  });
});
