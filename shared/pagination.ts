import { recordNumberSchema } from "./recordNumber";
import { z } from "zod";

export const cpfSearchSchema = z.string().trim().max(14)
  .regex(/^[0-9.\s-]*$/, "Informe o CPF somente com números, pontos e traço")
  .transform(value => value.replace(/\D/g, ""))
  .refine(value => value === "" || value.length === 11, "Informe os 11 dígitos do CPF");

const paging = {
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
};

export const patientSearchSchema = z
  .object({
    name: z.string().trim().max(200).optional(),
    code: z.union([z.literal(""), recordNumberSchema]).optional(),
    cpf: cpfSearchSchema.optional(),
    birthDate: z.string().trim().max(10).optional(),
    city: z.string().trim().max(100).optional(),
    ...paging,
  })
  .strict();

export const phoneBookSearchSchema = z
  .object({
    name: z.string().trim().max(200).optional(),
    ...paging,
  })
  .strict();

const legacyPaging = {
  limit: z.number().int().min(1).max(100).default(10),
  offset: z.number().int().min(0).max(1_000_000).default(0),
};
export const legacyPatientSearchSchema = patientSearchSchema
  .omit({ page: true, pageSize: true })
  .extend(legacyPaging);
export const legacyPhoneBookSearchSchema = phoneBookSearchSchema
  .omit({ page: true, pageSize: true })
  .extend(legacyPaging);

export type PatientSearchInput = z.input<typeof patientSearchSchema>;
export type PhoneBookSearchInput = z.input<typeof phoneBookSearchSchema>;

export function pagination(
  total: number,
  requestedPage: number,
  pageSize: number
) {
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, Math.max(1, totalPages));
  const offset = (page - 1) * pageSize;
  return {
    total,
    page,
    pageSize,
    totalPages,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(offset + pageSize, total),
  };
}

export type SearchPage<T> = ReturnType<typeof pagination> & { items: T[] };

// User-entered percent and underscore are text, not unbounded SQL wildcards.
export const searchPattern = (value: string) =>
  `%${value.replace(/[\\%_]/g, "\\$&")}%`;
