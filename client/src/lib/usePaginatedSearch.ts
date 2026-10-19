import { useEffect, useRef, useState } from "react";
import type { SearchPage } from "@shared/pagination";

export function usePaginatedSearch<F, T>(
  fetchPage: (filters: F, page: number) => Promise<SearchPage<T>>
) {
  const [snapshot, setSnapshot] = useState<{
    filters: F;
    result: SearchPage<T>;
  } | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const lastRequest = useRef<{ filters: F; page: number } | null>(null);
  useEffect(
    () => () => {
      sequence.current++;
    },
    []
  );

  const run = async (filters: F, page: number) => {
    const request = ++sequence.current;
    lastRequest.current = { filters, page };
    setHasSearched(true);
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPage(filters, page);
      // A slow previous search must not overwrite the most recent results.
      if (request === sequence.current) setSnapshot({ filters, result });
    } catch {
      if (request === sequence.current)
        setError("Não foi possível carregar os resultados. Tente novamente.");
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  };

  return {
    result: snapshot?.result ?? null,
    isLoading,
    hasSearched,
    error,
    search: (filters: F) => {
      void run(filters, 1);
    },
    goToPage: (page: number) => {
      if (!isLoading && snapshot) void run(snapshot.filters, page);
    },
    retry: () => {
      if (!isLoading && lastRequest.current)
        void run(lastRequest.current.filters, lastRequest.current.page);
    },
    reset: () => {
      sequence.current++;
      lastRequest.current = null;
      setSnapshot(null);
      setError(null);
      setLoading(false);
      setHasSearched(false);
    },
  };
}
