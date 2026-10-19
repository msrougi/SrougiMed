import type { SearchPage } from "@shared/pagination";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function SearchPagination({
  result,
  disabled,
  onPageChange,
}: {
  result: SearchPage<unknown>;
  disabled: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Paginação dos resultados"
      className="flex flex-wrap items-center justify-between gap-3 border-t p-4"
    >
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-gray-600 dark:text-slate-300"
      >
        {result.start}–{result.end} de {result.total} resultados
      </p>
      <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto">
        <Button
          variant="outline"
          size="sm"
          aria-label="Página anterior"
          disabled={disabled || result.page <= 1 || result.total === 0}
          onClick={() => onPageChange(result.page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Anterior
        </Button>
        <span className="text-sm whitespace-nowrap">
          Página {result.total === 0 ? 0 : result.page} de {result.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label="Próxima página"
          disabled={disabled || result.page >= result.totalPages}
          onClick={() => onPageChange(result.page + 1)}
        >
          Próxima <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
