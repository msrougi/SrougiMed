import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { parseCSV, parseExcel } from "../client/src/lib/importUtils";
import { patientsToCSV } from "../client/src/lib/exportUtils";
import type { TrpcContext } from "./_core/context";

const db = vi.hoisted(() => ({
  createPatient: vi.fn(),
  updatePatient: vi.fn(),
  importPatients: vi.fn().mockResolvedValue({ successCount: 1, errorCount: 0, errors: [] }),
}));
vi.mock("./db", () => db);

const caller = appRouter.createCaller({
  user: { id: 1, role: "admin" },
  req: {},
  res: {},
} as TrpcContext);

describe("CEP dos pacientes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserva o zero inicial e envia o CEP no cadastro", async () => {
    await caller.patients.create({ name: "Paciente de teste", zipCode: " 01234-567 " });
    expect(db.createPatient).toHaveBeenCalledWith({ name: "Paciente de teste", zipCode: "01234-567" });
  });

  it("envia uma string vazia na edição para permitir remover o CEP", async () => {
    await caller.patients.update({ id: 1, data: { zipCode: "" } });
    expect(db.updatePatient).toHaveBeenCalledWith(1, { zipCode: "" });
  });

  it("rejeita valores maiores que a capacidade do banco", async () => {
    await expect(caller.patients.create({ name: "Teste", zipCode: "12345678901" })).rejects.toThrow();
    expect(db.createPatient).not.toHaveBeenCalled();
  });

  it("mantém o CEP quando um cadastro passa por exportação e importação CSV", () => {
    const csv = patientsToCSV([{ id: 1, name: "Teste", zipCode: "01234-567" }]);
    expect(parseCSV(csv)[0].zipCode).toBe("01234-567");
  });

  it("reconhece o nome do campo legado Zip", () => {
    expect(parseCSV("Nome,Zip\nTeste,01234-567")[0].zipCode).toBe("01234-567");
  });

  it("preserva o CEP de uma planilha Excel", async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Nome: "Teste", CEP: "01234-567" }]), "Pacientes");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = { arrayBuffer: async () => bytes } as File;
    expect((await parseExcel(file))[0].zipCode).toBe("01234-567");
  });

  it("inclui o CEP na importação pela API", async () => {
    await caller.importData.importPatients([{ name: "Teste", zipCode: "01234-567" }]);
    expect(db.importPatients).toHaveBeenCalledWith([{ name: "Teste", zipCode: "01234-567" }]);
  });
});
