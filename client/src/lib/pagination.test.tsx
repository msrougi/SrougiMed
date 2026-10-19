// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  pagination,
  patientSearchSchema,
  phoneBookSearchSchema,
  searchPattern,
} from "@shared/pagination";
import SearchPagination from "../components/SearchPagination";
import { usePaginatedSearch } from "./usePaginatedSearch";

afterEach(cleanup);
const result = (total = 237, page = 1) => ({
  ...pagination(total, page, 10),
  items: [] as number[],
});

describe("paginação visível", () => {
  it.each([
    [1, "1–10 de 237 resultados", "Página 1 de 24"],
    [2, "11–20 de 237 resultados", "Página 2 de 24"],
    [24, "231–237 de 237 resultados", "Página 24 de 24"],
  ])("mostra intervalo real na página %s", (page, range, label) => {
    render(
      <SearchPagination
        result={result(237, Number(page))}
        disabled={false}
        onPageChange={vi.fn()}
      />
    );
    expect(screen.getByRole("status").textContent).toBe(range);
    expect(screen.getByText(label)).toBeTruthy();
  });
  it.each([0, 1, 10])("não permite avançar com %s resultados", total => {
    render(
      <SearchPagination
        result={result(total)}
        disabled={false}
        onPageChange={vi.fn()}
      />
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Próxima página",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Página anterior",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    if (total === 0) {
      expect(screen.getByRole("status").textContent).toBe(
        "0–0 de 0 resultados"
      );
      expect(screen.getByText("Página 0 de 0")).toBeTruthy();
    }
  });
  it("navega nas duas direções e bloqueia cliques durante carregamento", () => {
    const onPageChange = vi.fn();
    const view = render(
      <SearchPagination
        result={result(237, 2)}
        disabled={false}
        onPageChange={onPageChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(onPageChange.mock.calls).toEqual([[1], [3]]);
    view.rerender(
      <SearchPagination
        result={result(237, 2)}
        disabled
        onPageChange={onPageChange}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(onPageChange).toHaveBeenCalledTimes(2);
  });
});

describe("navegação e falhas de busca", () => {
  it("usa os filtros aplicados para avançar e voltar à primeira página", async () => {
    const fetch = vi.fn(async (_filters: { name: string }, page: number) =>
      result(237, page)
    );
    const { result: hook } = renderHook(() => usePaginatedSearch(fetch));
    act(() => hook.current.search({ name: "Maria" }));
    await waitFor(() => expect(hook.current.isLoading).toBe(false));
    act(() => hook.current.goToPage(2));
    await waitFor(() => expect(hook.current.result?.page).toBe(2));
    act(() => hook.current.goToPage(1));
    await waitFor(() => expect(hook.current.result?.page).toBe(1));
    expect(fetch.mock.calls).toEqual([
      [{ name: "Maria" }, 1],
      [{ name: "Maria" }, 2],
      [{ name: "Maria" }, 1],
    ]);
    act(() => hook.current.search({ name: "João" }));
    await waitFor(() => expect(hook.current.isLoading).toBe(false));
    expect(fetch).toHaveBeenLastCalledWith({ name: "João" }, 1);
  });
  it("mantém resultados confirmados após erro e repete a página que falhou", async () => {
    const fetch = vi.fn(async (_: string, page: number) => result(237, page));
    const { result: hook } = renderHook(() => usePaginatedSearch(fetch));
    act(() => hook.current.search("Maria"));
    await waitFor(() => expect(hook.current.result?.page).toBe(1));
    fetch.mockRejectedValueOnce(new Error("offline"));
    act(() => hook.current.goToPage(2));
    await waitFor(() => expect(hook.current.error).toBeTruthy());
    expect(hook.current.result?.page).toBe(1);
    act(() => hook.current.retry());
    await waitFor(() => expect(hook.current.result?.page).toBe(2));
    expect(hook.current.error).toBeNull();
  });
  it("ignora respostas antigas e resultados que chegam após limpar a busca", async () => {
    let resolveOld!: (value: ReturnType<typeof result>) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValueOnce(result(7));
    const { result: hook } = renderHook(() => usePaginatedSearch(fetch));
    act(() => hook.current.search("antiga"));
    act(() => hook.current.search("nova"));
    await waitFor(() => expect(hook.current.result?.total).toBe(7));
    await act(async () => resolveOld(result(237)));
    expect(hook.current.result?.total).toBe(7);
    act(() => hook.current.reset());
    expect(hook.current.result).toBeNull();
    expect(hook.current.hasSearched).toBe(false);
  });
  it("não exibe zero resultados como se fosse uma busca bem-sucedida quando a API falha", async () => {
    const { result: hook } = renderHook(() =>
      usePaginatedSearch(vi.fn().mockRejectedValue(new Error("offline")))
    );
    act(() => hook.current.search("Maria"));
    await waitFor(() => expect(hook.current.error).toBeTruthy());
    expect(hook.current.result).toBeNull();
    expect(hook.current.isLoading).toBe(false);
  });
});

describe("limites da API", () => {
  it("ajusta páginas que deixaram de existir e trata o zero", () => {
    expect(pagination(11, 5, 10)).toMatchObject({
      page: 2,
      start: 11,
      end: 11,
      totalPages: 2,
    });
    expect(pagination(0, 5, 10)).toMatchObject({
      page: 1,
      start: 0,
      end: 0,
      totalPages: 0,
    });
  });
  it.each([
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: 1.5 },
    { page: Infinity },
  ])("rejeita paginação inválida %j", value => {
    expect(patientSearchSchema.safeParse(value).success).toBe(false);
    expect(phoneBookSearchSchema.safeParse(value).success).toBe(false);
  });
  it("limita texto e transforma curingas em texto literal", () => {
    expect(
      patientSearchSchema.safeParse({ name: "x".repeat(201) }).success
    ).toBe(false);
    expect(searchPattern("50%_\\")).toBe("%50\\%\\_\\\\%");
  });
});
