import { eq, like, or, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, patients, skinColors, maritalStatuses, genders, phoneBook, InsertPatient, InsertPhoneBookEntry } from "../drizzle/schema";
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
  
  const result = await db.insert(patients).values(data);
  return result;
}

export async function searchPatients(filters: {
  name?: string;
  code?: string;
  birthDate?: string;
  city?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [];
  if (filters.name) {
    conditions.push(like(patients.name, `%${filters.name}%`));
  }
  if (filters.code) {
    conditions.push(eq(patients.code, filters.code));
  }
  if (filters.birthDate) {
    conditions.push(eq(patients.birthDate, filters.birthDate));
  }
  if (filters.city) {
    conditions.push(like(patients.city, `%${filters.city}%`));
  }

  let query = db.select().from(patients);
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const result = await query
    .limit(filters.limit || 10)
    .offset(filters.offset || 0);

  return result;
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
  
  await db.update(patients).set(data).where(eq(patients.id, id));
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

export async function searchPhoneBook(name?: string, limit = 10, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let query = db.select().from(phoneBook);
  
  if (name) {
    query = query.where(like(phoneBook.name, `%${name}%`)) as any;
  }

  const result = await query.limit(limit).offset(offset);
  return result;
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
export async function getAllUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return await db.select().from(users);
}

export async function createUser(data: { username: string; password: string; name?: string; role: "admin" | "user" }) {
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
