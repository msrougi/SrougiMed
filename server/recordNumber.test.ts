import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordNumberSchema } from "../shared/recordNumber";
const database = vi.hoisted(() => ({ createPatient: vi.fn(), updatePatient: vi.fn(), searchPatients: vi.fn() }));
vi.mock("./db", () => database);
import { appRouter } from "./routers";
const caller = () => appRouter.createCaller({ user: { id: 1, role: "user" }, req: {}, res: {} } as any);
const patient = { code: "48612", name: "Fixture", address: "Fixture", cep: "00000-000", city: "Fixture", state: "SP", cpf: "synthetic", birthDate: "01/01/1980", maritalStatusId: 1, genderId: 1 };
beforeEach(() => vi.clearAllMocks());
describe("prontuário manual", () => {
  it("aceita de um a oito dígitos e normaliza zeros à esquerda", () => {
    for (const code of ["2", "48612", "1244004", "99999999"]) expect(recordNumberSchema.parse(code)).toBe(code);
    expect(recordNumberSchema.parse("00048612")).toBe("48612");
    for (const code of ["", "0", "0000", "abc", "1.234", "-1", "123456789"]) expect(recordNumberSchema.safeParse(code).success).toBe(false);
  });
  it("cria somente com o prontuário informado, nunca gera outro", async () => {
    await caller().patients.create(patient);
    expect(database.createPatient).toHaveBeenCalledWith(patient);
    const { code, ...missing } = patient;
    await expect(caller().patients.create(missing as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.createPatient).toHaveBeenCalledTimes(1);
  });
  it("permite consultar um prontuário de um dígito e editar manualmente", async () => {
    await caller().patients.searchPage({ code: "2" });
    expect(database.searchPatients).toHaveBeenCalledWith(expect.objectContaining({ code: "2" }));
    await caller().patients.update({ id: 1, data: { code: "48612" } });
    expect(database.updatePatient).toHaveBeenCalledWith(1, { code: "48612" });
  });
});
