import { z } from "zod";

export function passwordRequirements(value: string) {
  return [
    { id: "length", label: "Pelo menos 8 caracteres", valid: Array.from(value).length >= 8 },
    { id: "letter", label: "Pelo menos uma letra", valid: new RegExp("\\p{L}", "u").test(value) },
    { id: "uppercase", label: "Pelo menos uma letra maiúscula", valid: new RegExp("\\p{Lu}", "u").test(value) },
    { id: "number", label: "Pelo menos um número", valid: /[0-9]/.test(value) },
    { id: "bytes", label: "No máximo 72 bytes", valid: new TextEncoder().encode(value).length <= 72 },
  ];
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual").max(1024),
  newPassword: z.string().max(72).superRefine((value, ctx) => {
    for (const rule of passwordRequirements(value)) {
      if (!rule.valid) ctx.addIssue({ code: "custom", message: rule.label });
    }
  }),
  confirmPassword: z.string().max(72),
}).strict().superRefine((value, ctx) => {
  if (value.newPassword !== value.confirmPassword) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "As senhas não coincidem" });
  if (value.newPassword === value.currentPassword) ctx.addIssue({ code: "custom", path: ["newPassword"], message: "A nova senha deve ser diferente da atual" });
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
