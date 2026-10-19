// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const api = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({ trpc: { customAuth: { changePassword: { useMutation: () => ({ mutate: api.mutate, isPending: false }) } } } }));
import ChangePasswordDialog from "../components/ChangePasswordDialog";
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
describe("formulário de alteração de senha", () => {
  it("mostra requisitos ao digitar e só permite envio com confirmação válida", () => {
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Salvar nova senha" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fill("Senha atual", "AtualFixture123");
    fill("Nova senha", "nova12345");
    expect(screen.getByText("Pendente:", { exact: false }).textContent).toContain("Pendente");
    fill("Nova senha", "NovaSenha123");
    fill("Confirmar nova senha", "OutraSenha123");
    expect(screen.getByText("As senhas não coincidem")).toBeTruthy();
    expect(button.disabled).toBe(true);
    fill("Confirmar nova senha", "NovaSenha123");
    expect(screen.getByText("As senhas coincidem")).toBeTruthy();
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(api.mutate).toHaveBeenCalledWith({ currentPassword: "AtualFixture123", newPassword: "NovaSenha123", confirmPassword: "NovaSenha123" });
  });
  it("limpa os campos ao cancelar", () => {
    const close = vi.fn();
    render(<ChangePasswordDialog open onOpenChange={close} />);
    fill("Nova senha", "NovaSenha123");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(close).toHaveBeenCalledWith(false);
    expect((screen.getByLabelText("Nova senha") as HTMLInputElement).value).toBe("");
  });
});
