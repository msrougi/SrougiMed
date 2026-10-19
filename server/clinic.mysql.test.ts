import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { randomBytes } from "node:crypto";
import express from "express";
import { createServer, type Server } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "./routers";

// Opt-in only. Never run fixtures or writes against a remote or production database.
const url = process.env.SROUGI_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/^\/srougi_test_[a-z0-9_]+$/.test(parsed.pathname)
  ) {
    throw new Error(
      "Regression database must be localhost with a srougi_test_ database name"
    );
  }
}

describe.skipIf(!url)("MySQL real isolado — dados sintéticos", () => {
  let connection: mysql.Connection;
  let server: Server;
  let db: typeof import("./db");
  let origin: string;
  const password = randomBytes(24).toString("hex");
  const client = () => {
    let cookie = "";
    return createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${origin}/api/trpc`,
          transformer: superjson,
          fetch: async (input, init) => {
            const headers = new Headers(init?.headers);
            if (cookie) headers.set("cookie", cookie);
            const response = await fetch(input, { ...init, headers });
            const received = response.headers.get("set-cookie");
            if (received) cookie = received.split(";")[0];
            return response;
          },
        }),
      ],
    });
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    connection = await mysql.createConnection(url!);
    for (const table of [
      "patients",
      "phone_book",
      "users",
      "skin_colors",
      "marital_statuses",
      "genders",
    ]) {
      await connection.query(`DELETE FROM \`${table}\``);
    }
    for (const table of ["skin_colors", "marital_statuses", "genders"]) {
      await connection.query(
        `INSERT INTO \`${table}\` (id,name) VALUES (1,'Fixture')`
      );
    }
    db = await import("./db");
    await db.createUser({
      username: "fixture_admin",
      name: "Fixture Admin",
      password,
      role: "admin",
    });
    await db.createUser({ username: "fixture_user_a", password, role: "user" });
    await db.createUser({ username: "fixture_user_b", password, role: "user" });
    for (let start = 1; start <= 46023; start += 1000) {
      const rows = Array.from(
        { length: Math.min(1000, 46024 - start) },
        (_, offset) => {
          const id = start + offset;
          return [
            id,
            `Fixture ${id <= 237 ? "Maria" : "Outro"} ${String(id).padStart(6, "0")}`,
            String(id).padStart(9, "0"),
            id % 2 ? "São Paulo" : "Santos",
            "01/01/1980",
            true,
            "Observação sintética em português",
          ];
        }
      );
      await connection.query(
        "INSERT INTO patients (id,name,code,city,birthDate,legacyImported,notes) VALUES ?",
        [rows]
      );
    }
    for (let start = 1; start <= 3201; start += 1000) {
      const rows = Array.from(
        { length: Math.min(1000, 3202 - start) },
        (_, offset) => {
          const id = start + offset;
          return [
            id,
            `Contato Fixture ${id <= 237 ? "Maria" : "Outro"} ${id}`,
            "Observação de contato sintético",
          ];
        }
      );
      await connection.query(
        "INSERT INTO phone_book (id,name,observations) VALUES ?",
        [rows]
      );
    }
    const { appRouter } = await import("./routers");
    const { createContext } = await import("./_core/context");
    const app = express();
    app.use(express.json());
    app.use(
      "/api/trpc",
      createExpressMiddleware({ router: appRouter, createContext })
    );
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  }, 60000);

  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    await connection?.end();
    const database = db && (await db.getDb());
    if (database) await database.$client.end();
  });

  it("calcula primeira, segunda, última, zero e página fora do intervalo sem repetir IDs", async () => {
    const first = await db.searchPatients({ name: "Maria" });
    const second = await db.searchPatients({ name: "Maria", page: 2 });
    const last = await db.searchPatients({ name: "Maria", page: 24 });
    expect(first).toMatchObject({
      total: 237,
      start: 1,
      end: 10,
      totalPages: 24,
    });
    expect(second).toMatchObject({ total: 237, start: 11, end: 20 });
    expect(last).toMatchObject({ start: 231, end: 237 });
    expect(last.items).toHaveLength(7);
    const legacyPatients = await db.searchPatientsLegacy({
      name: "Maria",
      limit: 10,
      offset: 5,
    });
    expect(legacyPatients.map(x => x.id)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(
      await db.searchPhoneBookLegacy({ name: "Maria", limit: 10, offset: 10 })
    ).toHaveLength(10);
    expect(first.items.map(x => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(second.items.map(x => x.id)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(await db.searchPatients({ name: "Maria", page: 1000 })).toEqual(
      last
    );
    expect(await db.searchPatients({ name: "Inexistente" })).toMatchObject({
      items: [],
      total: 0,
      start: 0,
      end: 0,
    });
    for (const page of [1, 2, 24]) {
      const contacts = await db.searchPhoneBook({ name: "Maria", page });
      expect(contacts).toMatchObject({ total: 237, page, totalPages: 24 });
      expect(contacts.items).toHaveLength(page === 24 ? 7 : 10);
    }
  });

  it("mantém todos os filtros no total e na lista, respeitando acentos e caixa", async () => {
    expect(
      await db.searchPatients({
        name: "mArIa",
        city: "são paulo",
        birthDate: "01/01/1980",
      })
    ).toMatchObject({ total: 119 });
    expect(await db.searchPatients({ code: "000000001" })).toMatchObject({
      total: 1,
    });
    expect(
      await db.searchPatients({
        name: "Maria",
        city: "São Paulo",
        code: "000000002",
      })
    ).toMatchObject({ total: 0, items: [] });
    for (const name of ["%_", "' OR 1=1 --"]) {
      expect((await db.searchPatients({ name })).total).toBe(0);
      expect((await db.searchPhoneBook({ name })).total).toBe(0);
    }
  });

  it("executa login, sessão, buscas e isolamento administrativo por HTTP com três contas", async () => {
    const anonymous = client();
    await expect(
      anonymous.patients.searchPage.mutate({ name: "Maria" })
    ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
    await expect(
      anonymous.customAuth.login.mutate({
        username: "fixture_admin",
        password: "incorrect-synthetic",
      })
    ).rejects.toThrow("Usuário ou senha inválidos");
    const admin = client(),
      userA = client(),
      userB = client();
    for (const [c, username] of [
      [admin, "fixture_admin"],
      [userA, "fixture_user_a"],
      [userB, "fixture_user_b"],
    ] as const) {
      await expect(
        c.customAuth.login.mutate({ username, password })
      ).resolves.toMatchObject({ success: true });
      expect(await c.customAuth.getCurrentUser.query()).not.toHaveProperty(
        "password"
      );
      expect(
        (await c.patients.searchPage.mutate({ name: "Maria", page: 2 })).total
      ).toBe(237);
      expect(
        (await c.phoneBook.searchPage.mutate({ name: "Maria", page: 24 })).end
      ).toBe(237);
    }
    const users = await admin.admin.listUsers.mutate();
    expect(users).toHaveLength(3);
    for (const user of users) expect(user).not.toHaveProperty("password");
    for (const c of [userA, userB]) {
      await expect(c.admin.listUsers.mutate()).rejects.toMatchObject({
        data: { code: "FORBIDDEN" },
      });
      await expect(c.export.getAllPatients.query()).rejects.toMatchObject({
        data: { code: "FORBIDDEN" },
      });
    }
    const target = users.find(x => x.username === "fixture_user_b")!;
    await admin.admin.updateUserRole.mutate({ id: target.id, role: "admin" });
    expect((await userB.admin.listUsers.mutate()).length).toBe(3);
    await admin.admin.updateUserRole.mutate({ id: target.id, role: "user" });
    // The existing JWT must not retain privileges after demotion in the database.
    await expect(userB.admin.listUsers.mutate()).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    await userA.auth.logout.mutate();
    await expect(
      userA.patients.searchPage.mutate({ name: "Maria" })
    ).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
  });

  it("cria, consulta, edita e remove somente fixtures locais de paciente e contato", async () => {
    const c = client();
    await c.customAuth.login.mutate({ username: "fixture_user_a", password });
    await c.patients.create.mutate({
      name: "Fixture CRUD",
      address: "Endereço sintético",
      cep: "00000-000",
      city: "Cidade fixture",
      state: "SP",
      cpf: "synthetic-cpf-unique",
      birthDate: "01/01/1980",
      maritalStatusId: 1,
      genderId: 1,
    });
    const patient = (
      await c.patients.searchPage.mutate({ name: "Fixture CRUD" })
    ).items[0];
    expect(await c.patients.getById.query(patient.id)).toMatchObject({
      name: "Fixture CRUD",
    });
    await expect(
      c.patients.create.mutate({
        name: "Duplicado",
        address: "Fixture",
        cep: "00000-000",
        city: "Fixture",
        state: "SP",
        cpf: "synthetic-cpf-unique",
        birthDate: "01/01/1980",
        maritalStatusId: 1,
        genderId: 1,
      })
    ).rejects.toThrow("CPF já está cadastrado");
    await c.patients.update.mutate({
      id: patient.id,
      data: { notes: "Fixture editada" },
    });
    expect(await c.patients.getById.query(patient.id)).toMatchObject({
      notes: "Fixture editada",
    });
    await c.patients.delete.mutate({ id: patient.id });
    expect(await c.patients.getById.query(patient.id)).toBeNull();
    await c.phoneBook.create.mutate({
      name: "Contato Fixture CRUD",
      observations: "Fixture",
    });
    const contact = (
      await c.phoneBook.searchPage.mutate({ name: "Contato Fixture CRUD" })
    ).items[0];
    await c.phoneBook.update.mutate({
      id: contact.id,
      data: { observations: "Fixture editada" },
    });
    expect(await c.phoneBook.getById.query(contact.id)).toMatchObject({
      observations: "Fixture editada",
    });
    await c.phoneBook.delete.mutate(contact.id);
    expect(await c.phoneBook.getById.query(contact.id)).toBeNull();
  });

  it("altera somente a senha da conta autenticada e aceita o novo login", async () => {
    const user = client();
    await user.customAuth.login.mutate({ username: "fixture_user_b", password });
    const nextPassword = "Nova" + randomBytes(16).toString("hex") + "9";
    await expect(user.customAuth.changePassword.mutate({ currentPassword: "incorreta", newPassword: nextPassword, confirmPassword: nextPassword })).rejects.toThrow("Senha atual incorreta");
    await expect(user.customAuth.changePassword.mutate({ currentPassword: password, newPassword: nextPassword, confirmPassword: nextPassword })).resolves.toEqual({ success: true });
    const newSession = client();
    await expect(newSession.customAuth.login.mutate({ username: "fixture_user_b", password })).rejects.toThrow("Usuário ou senha inválidos");
    await expect(newSession.customAuth.login.mutate({ username: "fixture_user_b", password: nextPassword })).resolves.toMatchObject({ success: true });
    const otherUser = client();
    await expect(otherUser.customAuth.login.mutate({ username: "fixture_user_a", password })).resolves.toMatchObject({ success: true });
  });

  it.skipIf(process.env.SROUGI_RUN_BENCHMARKS !== "1")(
    "mede buscas na base sintética sem usar esses tempos como evidência do Aiven",
    async () => {
      const scenarios = {
        codigo: () => db.searchPatients({ code: "000023000" }),
        nome_cidade: () =>
          db.searchPatients({ name: "Maria", city: "São Paulo" }),
        nome_amplo: () => db.searchPatients({ name: "Fixture" }),
        ultima_pagina: () => db.searchPatients({ name: "Fixture", page: 4603 }),
        contatos: () => db.searchPhoneBook({ name: "Fixture", page: 321 }),
      };
      const timings: Record<string, unknown> = {};
      for (const [name, search] of Object.entries(scenarios)) {
        await search();
        const samples: number[] = [];
        for (let i = 0; i < 20; i++) {
          const start = performance.now();
          await search();
          samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        timings[name] = {
          samples: 20,
          medianMs: +samples[10].toFixed(2),
          p95Ms: +samples[18].toFixed(2),
          maxMs: +samples[19].toFixed(2),
        };
      }
      const concurrentStart = performance.now();
      const pages = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          db.searchPatients({ name: "Maria", page: i + 1 })
        )
      );
      expect(pages.every(p => p.total === 237 && p.items.length === 10)).toBe(
        true
      );
      console.log(
        "SYNTHETIC_MYSQL_BENCHMARK",
        JSON.stringify({
          patients: 46023,
          contacts: 3201,
          mysql: "8.0 local",
          timings,
          tenConcurrentMs: +(performance.now() - concurrentStart).toFixed(2),
        })
      );
    },
    60000
  );
});
