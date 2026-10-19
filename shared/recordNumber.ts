import { z } from "zod";

export const RECORD_NUMBER_MAX_LENGTH = 8;
export const recordNumberSchema = z.string().trim()
  .regex(/^[0-9]{1,8}$/, "Informe um prontuário com 1 a 8 dígitos, somente números")
  .refine(value => !/^0+$/.test(value), "O prontuário deve ser maior que zero")
  .transform(value => value.replace(/^0+(?=\d)/, ""));
