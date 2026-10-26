import { beforeEach, describe, expect, it, vi } from "vitest";
const database = vi.hoisted(() =>
  Object.fromEntries(
    [
      "searchPatients",
      "searchPhoneBook",
      "getPatientById",
      "getPhoneBookEntryById",
      "getSkinColors",
      "getMaritalStatuses",
      "getGenders",
      "createPatient",
      "updatePatient",
      "deletePatient",
      "createPhoneBookEntry",
      "updatePhoneBookEntry",
      "deletePhoneBookEntry",
      "getAllPatients",
      "importPatients",
      "getAllUsers",
      "createUser",
      "deleteUser",
      "updateUserRole",
      "updateManagedUser",
    ].map(name => [name, vi.fn(async () => [])])
  )
);
vi.mock("./db", () => database);
import { appRouter } from "./routers";
const caller = (role: "admin" | "user" | null, id = 1) =>
  appRouter.createCaller({
    user: role ? { id, role } : null,
    req: {},
    res: {},
  } as any);
beforeEach(() => vi.clearAllMocks());

describe("regressão de acesso", () => {
  const operations = [
    (c: ReturnType<typeof caller>) => c.admin.listUsers(),
    (c: ReturnType<typeof caller>) =>
      c.admin.createUser({
        username: "fixture",
        password: "synthetic-only",
        role: "user",
      }),
    (c: ReturnType<typeof caller>) => c.admin.deleteUser({ id: 3 }),
    (c: ReturnType<typeof caller>) =>
      c.admin.updateUserRole({ id: 3, role: "admin" }),
    (c: ReturnType<typeof caller>) =>
      c.admin.updateUser({
        id: 3,
        username: "fixture",
        name: "Fixture",
        email: "",
        role: "user",
      }),
    (c: ReturnType<typeof caller>) => c.export.getAllPatients(),
    (c: ReturnType<typeof caller>) => c.export.patients(),
    (c: ReturnType<typeof caller>) => c.importData.importPatients([]),
  ];
  it.each(["user", null] as const)(
    "bloqueia todas as funções administrativas para %s",
    async role => {
      for (const operation of operations)
        await expect(operation(caller(role))).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      for (const mock of Object.values(database))
        expect(mock).not.toHaveBeenCalled();
    }
  );
  it("permite funções administrativas ao perfil correto", async () => {
    for (const operation of operations) await operation(caller("admin"));
    for (const name of [
      "getAllUsers",
      "createUser",
      "deleteUser",
      "updateUserRole",
      "updateManagedUser",
      "getAllPatients",
      "importPatients",
    ])
      expect(database[name]).toHaveBeenCalled();
  });
  it("bloqueia todos os caminhos de exclusão e rebaixamento da própria conta", async () => {
    const c = caller("admin");
    await expect(c.admin.deleteUser({ id: 1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      c.admin.updateUserRole({ id: 1, role: "user" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      c.admin.updateUser({
        id: 1,
        username: "fixture",
        name: "Fixture",
        email: "",
        role: "user",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.deleteUser).not.toHaveBeenCalled();
    expect(database.updateUserRole).not.toHaveBeenCalled();
  });
  it("bloqueia leitura e escrita clínica sem sessão", async () => {
    const c = caller(null);
    const operations = [
      () => c.patients.searchPage({ name: "Fixture" }),
      () => c.phoneBook.searchPage({ name: "Fixture" }),
      () => c.patients.getById(1),
      () => c.phoneBook.getById(1),
      () => c.patients.getSkinColors(),
      () => c.patients.getMaritalStatuses(),
      () => c.patients.getGenders(),
      () => c.patients.update({ id: 1, data: { name: "Fixture" } }),
      () => c.patients.delete({ id: 1 }),
      () => c.phoneBook.create({ name: "Fixture" }),
      () => c.phoneBook.update({ id: 1, data: { name: "Fixture" } }),
      () => c.phoneBook.delete(1),
      () => c.sofia.history({}),
      () => c.sofia.ask({ text: "Liste os pacientes",clientId:"d14d7929-51ee-4a63-9479-1eadf8070666" }),
    ];
    for (const operation of operations)
      await expect(operation()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    for (const mock of Object.values(database))
      expect(mock).not.toHaveBeenCalled();
  });
  it.each(["admin", "user"] as const)(
    "permite busca clínica compartilhada para %s com paginação validada",
    async role => {
      const c = caller(role);
      await c.patients.searchPage({
        name: " Fixture ",
        city: "São Paulo",
        page: 2,
      });
      expect(database.searchPatients).toHaveBeenCalledWith({
        name: "Fixture",
        city: "São Paulo",
        page: 2,
        pageSize: 10,
      });
      await c.phoneBook.searchPage({ name: "Fixture", page: 3 });
      expect(database.searchPhoneBook).toHaveBeenCalledWith({
        name: "Fixture",
        page: 3,
        pageSize: 10,
      });
      await expect(c.patients.searchPage({ page: -1 })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      await expect(
        c.phoneBook.searchPage({ pageSize: 100000 })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  );
  it("propaga falha de busca sem inventar resultados vazios", async () => {
    database.searchPatients.mockRejectedValueOnce(
      new Error("Database not available")
    );
    await expect(
      caller("user").patients.searchPage({ name: "Fixture" })
    ).rejects.toThrow("Database not available");
  });
});
