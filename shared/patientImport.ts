import { z } from "zod";

// Only the authenticated administrator import route may mark a row as legacy.
// Keep missing data null, without inventing documents, dates or lookup IDs.
const text = (max: number) => z.string().max(max).nullish();
const lookup = z.number().int().positive().nullish();
export const patientImportSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  code: z.string().trim().min(1).max(10).optional(),
  address: text(200), district: text(100), cep: text(9), phone: text(40), mobile: text(40),
  skinColorId: lookup, city: text(100), state: text(100), rg: text(100),
  cpf: text(100), birthDate: text(10), birthPlace: text(100),
  maritalStatusId: lookup, genderId: lookup, email: text(200),
  referredBy: text(100), registrationDate: text(10), occupation: text(200),
  additionalInfo1: text(200), additionalInfo2: text(200), notes: text(65535),
});

export function cpfChanged(previous: string | null | undefined, next: string | null | undefined) {
  // Formatting alone must not prevent editing an existing legacy duplicate.
  const key = (value: string | null | undefined) => (value ?? "").replace(/[.\-\s]/g, "");
  return key(previous) !== key(next);
}
