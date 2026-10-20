import { recordNumberSchema } from "../shared/recordNumber";
import { chatGroupSchema } from "../shared/chatMed";
import { changePasswordSchema, type ChangePasswordInput } from "../shared/changePassword";
import type { PatientSearchInput, PhoneBookSearchInput } from "../shared/pagination";
import { pagination, patientSearchSchema, phoneBookSearchSchema, searchPattern, cpfSearchSchema } from "../shared/pagination";
import { TRPCError } from "@trpc/server";
import type { UpdateUserInput } from "../shared/userManagement";
import { eq, like, or, and, sql, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, patients, skinColors, maritalStatuses, genders, phoneBook, InsertPatient, InsertPhoneBookEntry } from "../drizzle/schema";
import { cpfChanged } from "../shared/patientImport";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Funções de autenticação customizada
export async function authenticateUser(username: string, password: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot authenticate: database not available");
    return null;
  }

  const bcrypt = await import("bcryptjs");
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  
  if (result.length === 0) {
    return null;
  }

  const user = result[0];
  if (!user.password) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return null;
  }

  return user;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Funções de gerenciamento de pacientes

export async function createPatient(data: InsertPatient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const code = recordNumberSchema.parse(data.code);
    
    const sanitizeString = (str: string | null | undefined): string | null =>
      str == null || !str.trim() ? null : str;

    const sanitizedData = {
      ...data,
      name: sanitizeString(data.name as string) as string,
      address: sanitizeString(data.address as string | undefined),
      district: sanitizeString(data.district as string | undefined),
      cep: sanitizeString(data.cep as string | undefined),
      phone: sanitizeString(data.phone as string | undefined),
      mobile: sanitizeString(data.mobile as string | undefined),
      city: sanitizeString(data.city as string | undefined),
      state: sanitizeString(data.state as string | undefined),
      rg: sanitizeString(data.rg as string | undefined),
      cpf: sanitizeString(data.cpf as string | undefined),
      birthDate: sanitizeString(data.birthDate as string | undefined),
      birthPlace: sanitizeString(data.birthPlace as string | undefined),
      motherName: sanitizeString(data.motherName as string | undefined),
      fatherName: sanitizeString(data.fatherName as string | undefined),
      responsibleName: sanitizeString(data.responsibleName as string | undefined),
      responsiblePhone: sanitizeString(data.responsiblePhone as string | undefined),
      email: sanitizeString(data.email as string | undefined),
      referredBy: sanitizeString(data.referredBy as string | undefined),
      registrationDate: sanitizeString(data.registrationDate as string | undefined),
      occupation: sanitizeString(data.occupation as string | undefined),
      additionalInfo1: sanitizeString(data.additionalInfo1 as string | undefined),
      additionalInfo2: sanitizeString(data.additionalInfo2 as string | undefined),
      notes: sanitizeString(data.notes as string | undefined),
      code,
      legacyImported: false,
    };

    if (sanitizedData.cpf) {
      const existing = await db
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.cpf, sanitizedData.cpf))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Este CPF já está cadastrado para outro paciente.");
      }
    }
    
    const existingCode = await db.select({ id: patients.id }).from(patients).where(eq(patients.code, code)).limit(1);
    if (existingCode.length) throw new TRPCError({ code: "CONFLICT", message: "Este prontuário já está em uso por outro paciente" });
    const result = await db.insert(patients).values(sanitizedData).catch(error => {
      if (error.code === "ER_DUP_ENTRY" || error.cause?.code === "ER_DUP_ENTRY") {
        throw new TRPCError({ code: "CONFLICT", message: "Prontuário ou CPF já cadastrado. Confira os dados." });
      }
      throw error;
    });
    console.log("[createPatient] Inserção bem-sucedida");
    return result;
  } catch (error) {
    console.error("[createPatient] Erro ao inserir paciente:", error);
    throw error;
  }
}

function patientSearchWhere(filters: PatientSearchInput) {
  const conditions = [];
  if (filters.name)
    conditions.push(
      sql`LOWER(${patients.name}) LIKE LOWER(${searchPattern(filters.name)})`
    );
  if (filters.code) conditions.push(eq(patients.code, recordNumberSchema.parse(filters.code)));
  if (filters.cpf) conditions.push(
    sql`REPLACE(REPLACE(REPLACE(${patients.cpf}, '.', ''), '-', ''), ' ', '') = ${cpfSearchSchema.parse(filters.cpf)}`
  );
  if (filters.birthDate)
    conditions.push(eq(patients.birthDate, filters.birthDate));
  if (filters.city)
    conditions.push(
      sql`LOWER(${patients.city}) LIKE LOWER(${searchPattern(filters.city)})`
    );
  return and(...conditions);
}

// Compatibility for existing browser tabs: same array contract and exact offset.
export async function searchPatientsLegacy(
  filters: PatientSearchInput & { limit: number; offset: number }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(patients)
    .where(patientSearchWhere(filters))
    .orderBy(asc(patients.name), asc(patients.id))
    .limit(filters.limit)
    .offset(filters.offset);
}

export async function searchPatients(input: PatientSearchInput) {
  const filters = patientSearchSchema.parse(input);
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const where = patientSearchWhere(filters);
  return db.transaction(
    async tx => {
      const [count] = await tx
        .select({ total: sql<number>`count(*)` })
        .from(patients)
        .where(where);
      const meta = pagination(
        Number(count.total),
        filters.page,
        filters.pageSize
      );
      const items =
        meta.total === 0
          ? []
          : await tx
              .select()
              .from(patients)
              .where(where)
              .orderBy(asc(patients.name), asc(patients.id))
              .limit(meta.pageSize)
              .offset((meta.page - 1) * meta.pageSize);
      return { items, ...meta };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(patients).where(eq(patients.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updatePatient(id: number, data: Partial<InsertPatient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const current = await getPatientById(id);
  if (!current) throw new Error("Paciente não encontrado");
  const sanitizeString = (str: string | null | undefined): string | null =>
    str == null || !str.trim() ? null : str;

  const sanitizedData: Partial<InsertPatient> = {};
  if (data.code !== undefined) {
    const code = recordNumberSchema.parse(data.code);
    const existing = await db.select({ id: patients.id }).from(patients)
      .where(and(eq(patients.code, code), sql`${patients.id} <> ${id}`)).limit(1);
    if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Este prontuário já está em uso por outro paciente" });
    sanitizedData.code = code;
  }
  
  if (data.name !== undefined) sanitizedData.name = sanitizeString(data.name as string) as string;
  if (data.address !== undefined) sanitizedData.address = sanitizeString(data.address as string | undefined);
  if (data.district !== undefined) sanitizedData.district = sanitizeString(data.district as string | undefined);
  if (data.cep !== undefined) sanitizedData.cep = sanitizeString(data.cep as string | undefined);
  if (data.phone !== undefined) sanitizedData.phone = sanitizeString(data.phone as string | undefined);
  if (data.mobile !== undefined) sanitizedData.mobile = sanitizeString(data.mobile as string | undefined);
  if (data.city !== undefined) sanitizedData.city = sanitizeString(data.city as string | undefined);
  if (data.state !== undefined) sanitizedData.state = sanitizeString(data.state as string | undefined);
  if (data.rg !== undefined) sanitizedData.rg = sanitizeString(data.rg as string | undefined);
  if (data.cpf !== undefined) sanitizedData.cpf = sanitizeString(data.cpf as string | undefined);
  if (data.birthDate !== undefined) sanitizedData.birthDate = sanitizeString(data.birthDate as string | undefined);
  if (data.birthPlace !== undefined) sanitizedData.birthPlace = sanitizeString(data.birthPlace as string | undefined);
  if (data.motherName !== undefined) sanitizedData.motherName = sanitizeString(data.motherName as string | undefined);
  if (data.fatherName !== undefined) sanitizedData.fatherName = sanitizeString(data.fatherName as string | undefined);
  if (data.responsibleName !== undefined) sanitizedData.responsibleName = sanitizeString(data.responsibleName as string | undefined);
  if (data.responsiblePhone !== undefined) sanitizedData.responsiblePhone = sanitizeString(data.responsiblePhone as string | undefined);
  if (data.email !== undefined) sanitizedData.email = sanitizeString(data.email as string | undefined);
  if (data.referredBy !== undefined) sanitizedData.referredBy = sanitizeString(data.referredBy as string | undefined);
  if (data.registrationDate !== undefined) sanitizedData.registrationDate = sanitizeString(data.registrationDate as string | undefined);
  if (data.occupation !== undefined) sanitizedData.occupation = sanitizeString(data.occupation as string | undefined);
  if (data.additionalInfo1 !== undefined) sanitizedData.additionalInfo1 = sanitizeString(data.additionalInfo1 as string | undefined);
  if (data.additionalInfo2 !== undefined) sanitizedData.additionalInfo2 = sanitizeString(data.additionalInfo2 as string | undefined);
  if (data.notes !== undefined) sanitizedData.notes = sanitizeString(data.notes as string | undefined);

  if (sanitizedData.cpf && (!current.legacyImported || cpfChanged(current.cpf, sanitizedData.cpf))) {
    const existing = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.cpf, sanitizedData.cpf), sql`${patients.id} <> ${id}`))
      .limit(1);

    if (existing.length > 0) {
      throw new Error("Este CPF já está cadastrado para outro paciente.");
    }
  }
  
  // Copiar campos numéricos sem sanitização
  if (data.skinColorId !== undefined) sanitizedData.skinColorId = data.skinColorId;
  if (data.maritalStatusId !== undefined) sanitizedData.maritalStatusId = data.maritalStatusId;
  if (data.genderId !== undefined) sanitizedData.genderId = data.genderId;
  
  await db.update(patients).set(sanitizedData).where(eq(patients.id, id)).catch(error => {
    if (error.code === "ER_DUP_ENTRY" || error.cause?.code === "ER_DUP_ENTRY") {
      throw new TRPCError({ code: "CONFLICT", message: "Prontuário ou CPF já cadastrado. Confira os dados." });
    }
    throw error;
  });
}

export async function deletePatient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(patients).where(eq(patients.id, id));
}

// Funções para opções pré-cadastradas
export async function getSkinColors() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(skinColors);
}

export async function getMaritalStatuses() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(maritalStatuses);
}

export async function getGenders() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(genders);
}

// Funções de agenda telefônica
export async function createPhoneBookEntry(data: InsertPhoneBookEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(phoneBook).values(data);
  return result;
}

export async function searchPhoneBookLegacy(
  filters: PhoneBookSearchInput & { limit: number; offset: number }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const where = filters.name
    ? sql`LOWER(${phoneBook.name}) LIKE LOWER(${searchPattern(filters.name)})`
    : undefined;
  return db
    .select()
    .from(phoneBook)
    .where(where)
    .orderBy(asc(phoneBook.name), asc(phoneBook.id))
    .limit(filters.limit)
    .offset(filters.offset);
}

export async function searchPhoneBook(input: PhoneBookSearchInput) {
  const filters = phoneBookSearchSchema.parse(input);
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const where = filters.name
    ? sql`LOWER(${phoneBook.name}) LIKE LOWER(${searchPattern(filters.name)})`
    : undefined;
  return db.transaction(
    async tx => {
      const [count] = await tx
        .select({ total: sql<number>`count(*)` })
        .from(phoneBook)
        .where(where);
      const meta = pagination(
        Number(count.total),
        filters.page,
        filters.pageSize
      );
      const items =
        meta.total === 0
          ? []
          : await tx
              .select()
              .from(phoneBook)
              .where(where)
              .orderBy(asc(phoneBook.name), asc(phoneBook.id))
              .limit(meta.pageSize)
              .offset((meta.page - 1) * meta.pageSize);
      return { items, ...meta };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}

export async function getPhoneBookEntryById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.select().from(phoneBook).where(eq(phoneBook.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updatePhoneBookEntry(id: number, data: Partial<InsertPhoneBookEntry>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(phoneBook).set(data).where(eq(phoneBook.id, id));
}

export async function deletePhoneBookEntry(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(phoneBook).where(eq(phoneBook.id, id));
}

// Funções de gerenciamento de usuários
export async function changeOwnPassword(userId: number, input: ChangePasswordInput) {
  const values = changePasswordSchema.parse(input);
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const bcrypt = await import("bcryptjs");
  await db.transaction(async tx => {
    const [user] = await tx.select({ password: users.password }).from(users)
      .where(eq(users.id, userId)).limit(1).for("update");
    if (!user?.password || !await bcrypt.compare(values.currentPassword, user.password)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Senha atual incorreta" });
    }
    if (await bcrypt.compare(values.newPassword, user.password)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A nova senha deve ser diferente da atual" });
    }
    const password = await bcrypt.hash(values.newPassword, 10);
    await tx.update(users).set({ password }).where(eq(users.id, userId));
  });
  return { success: true };
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select({
    id: users.id, username: users.username, name: users.name, email: users.email,
    role: users.role, chatGroup: users.chatGroup, createdAt: users.createdAt, updatedAt: users.updatedAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users);
}

export async function updateManagedUser(input: UpdateUserInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const changes: Partial<InsertUser> = {
    username: input.username,
    name: input.name || null,
    email: input.email || null,
    role: input.role,
  };
  if (input.newPassword !== undefined) {
    const bcrypt = await import("bcryptjs");
    changes.password = await bcrypt.hash(input.newPassword, 10);
  }
  if (input.chatGroup !== undefined) changes.chatGroup = chatGroupSchema.parse(input.chatGroup) || null;
  try {
    await db.transaction(async tx => {
      const [existing] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, input.id)).limit(1).for("update");
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });
      await tx.update(users).set(changes).where(eq(users.id, input.id));
    });
  } catch (error) {
    const mysql = error as { code?: string; cause?: { code?: string } };
    if (mysql.code === "ER_DUP_ENTRY" || mysql.cause?.code === "ER_DUP_ENTRY") {
      throw new TRPCError({ code: "CONFLICT", message: "Este login já está em uso" });
    }
    throw error;
  }
  return { success: true };
}

export async function createUser(data: { username: string; password: string; name?: string; role: "admin" | "user"; chatGroup?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const bcrypt = await import("bcryptjs");
  const hashedPassword = await bcrypt.hash(data.password, 10);
  
  const result = await db.insert(users).values({
    openId: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    username: data.username,
    password: hashedPassword,
    name: data.name || data.username,
    role: data.role,
    chatGroup: chatGroupSchema.parse(data.chatGroup ?? "") || null,
  });
  
  return result;
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(users).where(eq(users.id, id));
}

export async function updateUserRole(id: number, role: "admin" | "user") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users).set({ role }).where(eq(users.id, id));
}

// Função para buscar todos os pacientes (para exportação)
export async function getAllPatients() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(patients);
}

// Função para importar pacientes em massa
export async function importPatients(patientsData: Array<{
  name?: string | null;
  code?: string | null;
  address?: string | null;
  district?: string | null;
  cep?: string | null;
  phone?: string | null;
  mobile?: string | null;
  skinColorId?: number | null;
  city?: string | null;
  state?: string | null;
  rg?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  motherName?: string | null;
  fatherName?: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  maritalStatusId?: number | null;
  genderId?: number | null;
  email?: string | null;
  referredBy?: string | null;
  registrationDate?: string | null;
  occupation?: string | null;
  additionalInfo1?: string | null;
  additionalInfo2?: string | null;
  notes?: string | null;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ row: number; error: string }> = [];
  
  for (let i = 0; i < patientsData.length; i++) {
    try {
      const patientData = patientsData[i];
      
      // Validar nome (obrigatório)
      if (!patientData.name || !patientData.name.trim()) {
        errorCount++;
        errors.push({ row: i + 1, error: "Nome é obrigatório" });
        continue;
      }
      
      // Inserir paciente
      await db.insert(patients).values({
        name: patientData.name,
        code: recordNumberSchema.parse(patientData.code),
        legacyImported: true,
        address: patientData.address || undefined,
        district: patientData.district || undefined,
        cep: patientData.cep || undefined,
        phone: patientData.phone || undefined,
        mobile: patientData.mobile || undefined,
        skinColorId: patientData.skinColorId || undefined,
        city: patientData.city || undefined,
        state: patientData.state || undefined,
        rg: patientData.rg || undefined,
        cpf: patientData.cpf || undefined,
        birthDate: patientData.birthDate || undefined,
        birthPlace: patientData.birthPlace || undefined,
        motherName: patientData.motherName || undefined,
        fatherName: patientData.fatherName || undefined,
        responsibleName: patientData.responsibleName || undefined,
        responsiblePhone: patientData.responsiblePhone || undefined,
        maritalStatusId: patientData.maritalStatusId || undefined,
        genderId: patientData.genderId || undefined,
        email: patientData.email || undefined,
        referredBy: patientData.referredBy || undefined,
        registrationDate: patientData.registrationDate || undefined,
        occupation: patientData.occupation || undefined,
        additionalInfo1: patientData.additionalInfo1 || undefined,
        additionalInfo2: patientData.additionalInfo2 || undefined,
        notes: patientData.notes || undefined,
      });
      
      successCount++;
    } catch (error) {
      errorCount++;
      errors.push({
        row: i + 1,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }
  
  return {
    successCount,
    errorCount,
    errors,
    totalProcessed: patientsData.length,
  };
}


// Autenticação customizada com JWT
export async function authenticateCustomToken(token: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot authenticate: database not available");
    return null;
  }

  try {
    const jwtModule = await import("jsonwebtoken");
    const jwt = jwtModule.default as any;
    const ENV = (await import('./_core/env')).ENV;
    
    const decoded = jwt.verify(token, ENV.cookieSecret) as any;
    
    if (!decoded.userId) {
      return null;
    }

    const user = await getUserById(decoded.userId);
    return user || null;
  } catch (error) {
    console.warn("[Auth] Token verification failed:", error);
    return null;
  }
}

