import { z } from "zod";

export const sofiaAskSchema = z.object({
  text: z.string().trim().min(1, "Digite uma pergunta").max(1000, "A pergunta deve ter até 1.000 caracteres"),
  clientId: z.string().uuid(),
}).strict();

export const sofiaHistorySchema = z.object({
  beforeId: z.number().int().positive().optional(),
  afterId: z.number().int().positive().optional(),
}).strict().refine(value => !(value.beforeId && value.afterId), "Use apenas um cursor por vez");

export type SofiaMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  createdAt: Date;
};

export type SofiaAskResult = {
  userMessage: SofiaMessage;
  assistantMessage: SofiaMessage;
};
