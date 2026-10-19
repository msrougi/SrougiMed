import { useState } from "react";
import { Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { changePasswordSchema, passwordRequirements } from "@shared/changePassword";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const change = trpc.customAuth.changePassword.useMutation({
    onSuccess: () => {
      setForm(emptyForm); setError(""); onOpenChange(false);
      toast.success("Senha alterada com sucesso! Use a nova senha no próximo acesso.");
    },
    onError: error => setError(error.message || "Não foi possível alterar a senha. Tente novamente."),
  });
  const parsed = changePasswordSchema.safeParse(form);
  const rules = passwordRequirements(form.newPassword);
  const close = (value: boolean) => {
    if (change.isPending) return;
    if (!value) { setForm(emptyForm); setError(""); }
    onOpenChange(value);
  };
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Alterar minha senha</DialogTitle>
        <DialogDescription>Informe a senha atual e escolha uma nova senha para sua conta.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        if (change.isPending) return;
        if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
        setError(""); change.mutate(parsed.data);
      }}>
        <div>
          <Label htmlFor="own-current-password">Senha atual</Label>
          <Input id="own-current-password" type="password" autoComplete="current-password" maxLength={1024} required
            value={form.currentPassword} disabled={change.isPending} onChange={e => { setError(""); setForm({ ...form, currentPassword: e.target.value }); }} />
        </div>
        <div>
          <Label htmlFor="own-new-password">Nova senha</Label>
          <Input id="own-new-password" type="password" autoComplete="new-password" maxLength={72} required
            value={form.newPassword} disabled={change.isPending} aria-describedby="own-password-rules" onChange={e => { setError(""); setForm({ ...form, newPassword: e.target.value }); }} />
          <ul id="own-password-rules" className="mt-3 space-y-1.5 text-sm" aria-live="polite">
            {rules.filter(rule => rule.id !== "bytes" || !rule.valid).map(rule => {
              const Icon = rule.valid ? Check : Circle;
              return <li key={rule.id} className={`flex items-center gap-2 ${rule.valid ? "text-brand" : "text-muted-foreground"}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="sr-only">{rule.valid ? "Atendido: " : "Pendente: "}</span>{rule.label}
              </li>;
            })}
          </ul>
        </div>
        <div>
          <Label htmlFor="own-confirm-password">Confirmar nova senha</Label>
          <Input id="own-confirm-password" type="password" autoComplete="new-password" maxLength={72} required
            value={form.confirmPassword} disabled={change.isPending} aria-describedby="own-password-match" aria-invalid={!!form.confirmPassword && form.confirmPassword !== form.newPassword}
            onChange={e => { setError(""); setForm({ ...form, confirmPassword: e.target.value }); }} />
          {form.confirmPassword && <p id="own-password-match" aria-live="polite" className={`mt-2 text-sm ${form.confirmPassword === form.newPassword ? "text-brand" : "text-red-700 dark:text-red-300"}`}>
            {form.confirmPassword === form.newPassword ? "As senhas coincidem" : "As senhas não coincidem"}
          </p>}
          {form.newPassword && form.newPassword === form.currentPassword && <p className="mt-2 text-sm text-red-700 dark:text-red-300">A nova senha deve ser diferente da atual</p>}
        </div>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={change.isPending} onClick={() => close(false)}>Cancelar</Button>
          <Button type="submit" disabled={!parsed.success || change.isPending}>{change.isPending ? "Alterando…" : "Salvar nova senha"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
