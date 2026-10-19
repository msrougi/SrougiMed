import { z } from "zod";

export const updateUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().trim().min(1, "Informe o login").max(100, "O login deve ter no máximo 100 caracteres"),
  name: z.string().trim().max(200, "O nome deve ter no máximo 200 caracteres"),
  email: z.string().trim().max(320).refine(value => !value || z.string().email().safeParse(value).success, "Informe um e-mail válido"),
  role: z.enum(["admin", "user"]),
  newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres")
    .refine(value => value.trim().length > 0, "A senha não pode conter apenas espaços")
    .refine(value => new TextEncoder().encode(value).length <= 72, "A nova senha deve ter no máximo 72 bytes")
    .optional(),
}).strict();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
