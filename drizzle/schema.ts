import { sql } from "drizzle-orm";
import { boolean, index, int, uniqueIndex, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 100 }).unique(),
  password: varchar("password", { length: 255 }),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Tabela de cores de pele (opções pré-cadastradas)
export const skinColors = mysqlTable("skin_colors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
});

export type SkinColor = typeof skinColors.$inferSelect;
export type InsertSkinColor = typeof skinColors.$inferInsert;

// Tabela de estados civis (opções pré-cadastradas)
export const maritalStatuses = mysqlTable("marital_statuses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
});

export type MaritalStatus = typeof maritalStatuses.$inferSelect;
export type InsertMaritalStatus = typeof maritalStatuses.$inferInsert;

// Tabela de sexos (opções pré-cadastradas)
export const genders = mysqlTable("genders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
});

export type Gender = typeof genders.$inferSelect;
export type InsertGender = typeof genders.$inferInsert;

// Tabela de pacientes
export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 10 }).notNull().unique().$defaultFn(() => ''),
  address: varchar("address", { length: 200 }),
  district: varchar("district", { length: 100 }),
  cep: varchar("cep", { length: 9 }),
  phone: varchar("phone", { length: 40 }),
  mobile: varchar("mobile", { length: 40 }),
  skinColorId: int("skinColorId"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  rg: varchar("rg", { length: 100 }),
  cpf: varchar("cpf", { length: 100 }),
  legacyImported: boolean("legacyImported").notNull().default(false),
  // Legacy CPFs can repeat; new registrations retain a database uniqueness guard.
  cpfForNewPatients: varchar("cpfForNewPatients", { length: 100 }).generatedAlwaysAs(
    sql`CASE WHEN \`legacyImported\` = 0 THEN NULLIF(TRIM(\`cpf\`), '') ELSE NULL END`,
    { mode: "stored" },
  ),
  birthDate: varchar("birthDate", { length: 10 }),
  birthPlace: varchar("birthPlace", { length: 100 }),
  motherName: varchar("motherName", { length: 200 }),
  fatherName: varchar("fatherName", { length: 200 }),
  maritalStatusId: int("maritalStatusId"),
  genderId: int("genderId"),
  email: varchar("email", { length: 200 }),
  referredBy: varchar("referredBy", { length: 100 }),
  registrationDate: varchar("registrationDate", { length: 10 }),
  occupation: varchar("occupation", { length: 200 }),
  additionalInfo1: varchar("additionalInfo1", { length: 200 }),
  additionalInfo2: varchar("additionalInfo2", { length: 200 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("patients_cpf_idx").on(table.cpf),
  uniqueIndex("patients_new_cpf_unique").on(table.cpfForNewPatients),
]);

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

// Tabela de agenda telefônica
export const phoneBook = mysqlTable("phone_book", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 200 }),
  occupation: varchar("occupation", { length: 200 }),
  category: varchar("category", { length: 200 }),
  phone: varchar("phone", { length: 200 }),
  observations: text("observations"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PhoneBookEntry = typeof phoneBook.$inferSelect;
export type InsertPhoneBookEntry = typeof phoneBook.$inferInsert;

