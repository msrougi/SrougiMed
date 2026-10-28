// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { pagination } from "@shared/pagination";
const api = vi.hoisted(() => ({
  patients: vi.fn(),
  contacts: vi.fn(),
  delete: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    patients: {
      searchPage: { useMutation: () => ({ mutateAsync: api.patients }) },
      delete: { useMutation: () => ({ mutate: api.delete }) },
      getSkinColors: { useQuery: () => ({ data: [] }) },
      getMaritalStatuses: { useQuery: () => ({ data: [] }) },
      getGenders: { useQuery: () => ({ data: [] }) },
    },
    phoneBook: {
      searchPage: { useMutation: () => ({ mutateAsync: api.contacts }) },
      delete: { useMutation: () => ({ mutate: api.delete }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { error: api.toast, success: vi.fn() } }));
import PatientSearch from "../components/PatientSearch";
import PhoneBookSearch from "../components/PhoneBookSearch";

afterEach(cleanup);
it.each(["11122233344", "111.222.333-44", null, undefined])("mostra CPF %s em vez de e-mail no resumo de pacientes", async cpf => {
  api.patients.mockResolvedValueOnce({ ...pagination(1, 1, 10), items: [{ id: 1, name: "Paciente fictício", cpf, email: "fixture@example.invalid" }] });
  render(<PatientSearch />);
  fireEvent.change(screen.getByLabelText("Nome do Paciente"), { target: { value: "Fictício" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await screen.findByText("Paciente fictício");
  expect(screen.getByRole("columnheader", { name: "CPF" })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: "E-mail" })).toBeNull();
  const cell = screen.getAllByRole("cell").find(element => element.getAttribute("data-label") === "CPF");
  expect(cell?.textContent).toBe(cpf || "-");
  expect(screen.queryByText("fixture@example.invalid")).toBeNull();
});
it.each(["11122233344", "111.222.333-44"])("busca CPF completo %s e mantém o filtro na paginação", async cpf => {
  render(<PatientSearch />);
  fireEvent.change(screen.getByLabelText("CPF"), { target: { value: cpf } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await screen.findByText("1–10 de 237 resultados");
  expect(api.patients).toHaveBeenLastCalledWith(expect.objectContaining({ cpf: "11122233344", page: 1 }));
  fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "99988877766" } });
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  await screen.findByText("11–20 de 237 resultados");
  expect(api.patients).toHaveBeenLastCalledWith(expect.objectContaining({ cpf: "11122233344", page: 2 }));
});

it("não envia CPF incompleto mesmo quando outro filtro está preenchido", () => {
  render(<PatientSearch />);
  fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "111" } });
  fireEvent.change(screen.getByLabelText("Nome do Paciente"), { target: { value: "Fixture" } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  expect(api.patients).not.toHaveBeenCalled();
  expect(api.toast).toHaveBeenCalledWith("Informe os 11 dígitos do CPF");
});
beforeEach(() => {
  vi.clearAllMocks();
  for (const search of [api.patients, api.contacts])
    search.mockImplementation(async ({ page }: { page: number }) => ({
      ...pagination(237, page, 10),
      items: [{ id: page, name: `Fixture página ${page}`, code: "001" }],
    }));
});

describe.each([
  ["pacientes", PatientSearch, "Nome do Paciente", api.patients],
  ["contatos", PhoneBookSearch, "Nome do Contato", api.contacts],
] as const)("tela de %s", (_name, Component, label, search) => {
  it("aplica busca, mantém os critérios ao editar rascunho, avança e retorna à primeira página", async () => {
    render(<Component />);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "Maria" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByText("1–10 de 237 resultados");
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "João" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByText("11–20 de 237 resultados");
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Maria", page: 2, pageSize: 10 })
    );
    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    await screen.findByText("1–10 de 237 resultados");
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Maria", page: 1 })
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "João", page: 1 })
      )
    );
  });
  it("mostra zero e mantém navegação bloqueada", async () => {
    search.mockResolvedValueOnce({ ...pagination(0, 1, 10), items: [] });
    render(<Component />);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "Ausente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByText("0–0 de 0 resultados");
    expect(
      (
        screen.getByRole("button", {
          name: "Próxima página",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
  it("oferece recuperação após erro sem dizer que não há resultados", async () => {
    search.mockRejectedValueOnce(new Error("offline"));
    render(<Component />);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "Maria" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("0–0 de 0 resultados")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("1–10 de 237 resultados");
  });
  it("não busca com apenas um caractere", () => {
    render(<Component />);
    fireEvent.change(screen.getByLabelText(label), { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(api.toast).toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
});
