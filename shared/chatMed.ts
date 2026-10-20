import { z } from "zod";
import type { ChatAttachment } from "./chatAttachments";

// A single canonical name prevents spaces/capitalization from splitting a team.
export const chatGroupSchema = z.string().normalize("NFKC").trim()
  .transform(value => value.replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"))
  .pipe(z.string().max(60, "O grupo deve ter no máximo 60 caracteres")
    .regex(new RegExp("^[\\p{L}\\p{N} ._-]*$", "u"), "Use letras, números, espaços, ponto, traço ou sublinhado no grupo"));
export const chatThreadSchema = z.object({
  group: chatGroupSchema.pipe(z.string().min(1)),
  peerId: z.number().int().positive().nullable(),
}).strict();
export const chatHistorySchema = chatThreadSchema.extend({
  beforeId: z.number().int().positive().optional(),
  afterId: z.number().int().positive().optional(),
}).refine(value => !(value.beforeId && value.afterId), "Use apenas um cursor por vez");
export const chatSendSchema = chatThreadSchema.extend({
  text: z.string().trim().min(1, "Digite uma mensagem").max(4000, "A mensagem deve ter até 4.000 caracteres"),
  clientId: z.string().uuid(),
}).strict();
export type ChatThread = z.infer<typeof chatThreadSchema>;
export type ChatHistoryInput = z.infer<typeof chatHistorySchema>;
export type ChatSendInput = z.infer<typeof chatSendSchema>;
export type ChatMessage = { id: number; senderId: number; senderName: string; text: string; createdAt: Date; attachment?: ChatAttachment };
