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

// Função para importar pacientes em massa
export async function importPatients(patientsData: Array<{
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  mobile?: string | null;
  skinColorId?: number | null;
  city?: string | null;
  state?: string | null;
  rg?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
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
        code: patientData.code || null,
        address: patientData.address || null,
        phone: patientData.phone || null,
        mobile: patientData.mobile || null,
        skinColorId: patientData.skinColorId || null,
        city: patientData.city || null,
        state: patientData.state || null,
        rg: patientData.rg || null,
        cpf: patientData.cpf || null,
        birthDate: patientData.birthDate || null,
        birthPlace: patientData.birthPlace || null,
        maritalStatusId: patientData.maritalStatusId || null,
        genderId: patientData.genderId || null,
        email: patientData.email || null,
        referredBy: patientData.referredBy || null,
        registrationDate: patientData.registrationDate || null,
        occupation: patientData.occupation || null,
        additionalInfo1: patientData.additionalInfo1 || null,
        additionalInfo2: patientData.additionalInfo2 || null,
        notes: patientData.notes || null,
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
