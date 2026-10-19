import { describe, expect, it, vi, beforeEach } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { patientSearchSchema, legacyPatientSearchSchema } from "../shared/pagination";

const mock = vi.hoisted(() => ({ select: vi.fn(), transaction: vi.fn(), where: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => mock }));
import { searchPatients, searchPatientsLegacy } from "./db";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://unused/test");
  vi.clearAllMocks();
  mock.transaction.mockImplementation(async callback => callback(mock));
  mock.select.mockImplementation(fields => ({ from: () => ({ where: (condition: any) => {
    mock.where(condition);
    return fields ? Promise.resolve([{ total: 1 }]) : {
      orderBy: () => ({ limit: () => ({ offset: async () => [{ id: 1, cpf: "111.222.333-44" }] }) }),
    };
  } }) }));
});

describe("busca exata de CPF", () => {
  it.each(["11122233344", "111.222.333-44", " 111.222.333-44 "])("normaliza %s nas duas rotas", cpf => {
    expect(patientSearchSchema.parse({ cpf }).cpf).toBe("11122233344");
    expect(legacyPatientSearchSchema.parse({ cpf }).cpf).toBe("11122233344");
  });
  it.each(["111", "111222333444", "abc11122233344", "%", "' OR 1=1 --"])("rejeita entrada inválida %s", cpf => {
    expect(patientSearchSchema.safeParse({ cpf }).success).toBe(false);
  });
  it("aceita CPF vazio para preservar buscas pelos outros campos", () => {
    expect(patientSearchSchema.parse({ cpf: "", name: "Fixture" }).cpf).toBe("");
  });
  it("aplica CPF parametrizado e os demais filtros ao total e à lista", async () => {
    const result = await searchPatients({ cpf: "111.222.333-44", name: "Fixture", city: "Cidade" });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(mock.where).toHaveBeenCalledTimes(2);
    const queries = mock.where.mock.calls.map(([where]) => new MySqlDialect().sqlToQuery(where));
    expect(queries[0]).toEqual(queries[1]);
    expect(queries[0].sql).toContain("REPLACE(REPLACE(REPLACE(`patients`.`cpf`");
    expect(queries[0].params).toEqual(["%Fixture%", "11122233344", "%Cidade%"]);
    expect(queries[0].sql).not.toContain("11122233344");
  });
  it("mantém filtro também na rota compatível com abas antigas", async () => {
    await searchPatientsLegacy({ cpf: "111.222.333-44", limit: 10, offset: 0 });
    const query = new MySqlDialect().sqlToQuery(mock.where.mock.calls[0][0]);
    expect(query.params).toEqual(["11122233344"]);
  });
});
