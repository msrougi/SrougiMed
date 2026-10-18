import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), values: vi.fn(), set: vi.fn(),
}));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => fake }));
import { importPatients, updatePatient } from "./db";

function rows(value: unknown[]) {
  const chain: any = { from: () => chain, where: () => chain, limit: async () => value,
    then: (resolve: any) => Promise.resolve(value).then(resolve) };
  return chain;
}

beforeEach(() => {
  process.env.DATABASE_URL = "mysql://local-test-only";
  vi.clearAllMocks();
  fake.values.mockResolvedValue([{ insertId: 20 }]);
  fake.insert.mockReturnValue({ values: fake.values });
  fake.set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  fake.update.mockReturnValue({ set: fake.set });
});

describe("Persistência dos pacientes migrados", () => {
  it("preserva dois pacientes com CPF igual e gera códigos distintos quando não fornecidos", async () => {
    fake.select.mockReturnValueOnce(rows([{ maxCode: 2 }])).mockReturnValueOnce(rows([{ maxCode: 3 }]));
    const result = await importPatients([
      { name: "Paciente de teste A", cpf: "12345678900", phone: "11 1111-1111 / 11 2222-2222", district: "Bairro sintético" },
      { name: "Paciente de teste B", cpf: "12345678900" },
    ]);
    expect(result).toMatchObject({ successCount: 2, errorCount: 0 });
    expect(fake.values.mock.calls.map(([value]) => [value.code, value.cpf, value.legacyImported])).toEqual([
      ["000000003", "12345678900", true], ["000000004", "12345678900", true],
    ]);
    expect(fake.values.mock.calls[0][0].district).toBe("Bairro sintético");
    expect(fake.values.mock.calls[1][0].birthDate).toBeUndefined();
  });
  it("permite editar endereço sem bloquear CPF repetido inalterado", async () => {
    fake.select.mockReturnValueOnce(rows([{ id: 20, legacyImported: true, cpf: "12345678900" }]));
    await updatePatient(20, { cpf: "123.456.789-00", address: "Rua de teste", district: "Bairro sintético", birthDate: null });
    expect(fake.select).toHaveBeenCalledTimes(1);
    expect(fake.set).toHaveBeenCalledWith(expect.objectContaining({ address: "Rua de teste", district: "Bairro sintético", birthDate: null }));
  });
  it("recusa mudar o CPF legado para o de outro paciente", async () => {
    fake.select.mockReturnValueOnce(rows([{ id: 20, legacyImported: true, cpf: "12345678900" }]))
      .mockReturnValueOnce(rows([{ id: 21 }]));
    await expect(updatePatient(20, { cpf: "98765432100" })).rejects.toThrow("já está cadastrado");
    expect(fake.update).not.toHaveBeenCalled();
  });
  it("não permite transformar registro comum em legado pelo update", async () => {
    fake.select.mockReturnValueOnce(rows([{ id: 20, legacyImported: false, cpf: null }]));
    await updatePatient(20, { name: "Teste", legacyImported: true });
    expect(fake.set.mock.calls[0][0]).not.toHaveProperty("legacyImported");
  });
});
