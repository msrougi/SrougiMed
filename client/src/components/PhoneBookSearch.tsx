import RecordActions from "./RecordActions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import SearchPagination from "./SearchPagination";
import { usePaginatedSearch } from "@/lib/usePaginatedSearch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PhoneBookView from "@/components/PhoneBookView";

interface PhoneBookSearchProps {
  onEditEntry?: (entry: any) => void;
}

export default function PhoneBookSearch({ onEditEntry }: PhoneBookSearchProps) {
  const [searchName, setSearchName] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewingEntry, setViewingEntry] = useState<any | null>(null);

  const searchMutation = trpc.phoneBook.searchPage.useMutation();
  const search = usePaginatedSearch((applied: { name: string }, page: number) =>
    searchMutation.mutateAsync({ ...applied, page, pageSize: 10 })
  );
  const { result, isLoading, hasSearched, error } = search;
  const entries = result?.items ?? [];

  const handleSearch = () => {
    if (searchName.trim().length < 2) {
      toast.error("Digite pelo menos 2 caracteres para buscar");
      return;
    }
    search.search({ name: searchName });
  };

  const deleteMutation = trpc.phoneBook.delete.useMutation({
    onSuccess: () => {
      toast.success("Contato deletado com sucesso!");
      setDeleteId(null);
      // Limpar tela de busca e remover o resultado excluído imediatamente.
      setSearchName("");
      search.reset();
    },
    onError: error => {
      toast.error(error.message || "Erro ao deletar contato");
    },
  });

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate(deleteId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">
          Buscar Contato
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="search">Nome do Contato</Label>
            <Input
              id="search"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              placeholder="Digite o nome para buscar"
            />
          </div>
          <div className="flex items-end [&>button]:w-full">
            <Button
              onClick={handleSearch}
              disabled={isLoading}
              className="bg-[#087e78] hover:bg-[#06665f]"
            >
              Buscar
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-card rounded-lg shadow overflow-hidden">
        {error && (
          <div
            role="alert"
            className="p-4 text-sm text-red-700 dark:text-red-300"
          >
            {error}{" "}
            {result && "Os resultados abaixo são da última busca concluída."}
            <Button
              variant="outline"
              size="sm"
              onClick={search.retry}
              disabled={isLoading}
              className="ml-2"
            >
              Tentar novamente
            </Button>
          </div>
        )}
        {!hasSearched ? (
          <div className="p-6 text-center text-gray-600 dark:text-slate-300">
            Digite um nome e clique em "Buscar" para encontrar contatos
          </div>
        ) : isLoading ? (
          <div className="p-6 text-center text-gray-600 dark:text-slate-300">
            Carregando contatos...
          </div>
        ) : !result ? null : entries.length === 0 ? (
          <div className="p-6 text-center text-gray-600 dark:text-slate-300">
            Nenhum contato encontrado
          </div>
        ) : (
          <>
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Ocupação</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="sticky right-0 z-20 w-36 min-w-36 border-l bg-white dark:bg-card text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell
                      data-label="Nome"
                      className="min-w-48 max-w-72 whitespace-normal break-words font-medium"
                    >
                      {entry.name}
                    </TableCell>
                    <TableCell
                      data-label="Telefone"
                      className="max-w-60 whitespace-normal break-words"
                    >
                      {entry.phone || "-"}
                    </TableCell>
                    <TableCell
                      data-label="E-mail"
                      className="max-w-60 whitespace-normal [overflow-wrap:anywhere]"
                    >
                      {entry.email || "-"}
                    </TableCell>
                    <TableCell
                      data-label="Ocupação"
                      className="max-w-48 whitespace-normal break-words"
                    >
                      {entry.occupation || "-"}
                    </TableCell>
                    <TableCell
                      data-label="Categoria"
                      className="max-w-48 whitespace-normal break-words"
                    >
                      {entry.category || "-"}
                    </TableCell>
                    <TableCell
                      data-label="Ações"
                      className="record-actions sticky right-0 z-10 w-36 min-w-36 border-l bg-white dark:bg-card text-right"
                    >
                      <RecordActions
                        subject="contato"
                        onView={() => setViewingEntry(entry)}
                        onEdit={() => {
                          onEditEntry?.(entry);
                        }}
                        onDelete={() => setDeleteId(entry.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
        {result && (
          <SearchPagination
            result={result}
            disabled={isLoading}
            onPageChange={search.goToPage}
          />
        )}
      </div>

      {/* Dialog de Visualização */}
      <Dialog
        open={viewingEntry !== null}
        onOpenChange={open => {
          if (!open) setViewingEntry(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Contato</DialogTitle>
          </DialogHeader>
          {viewingEntry && (
            <PhoneBookView
              entry={viewingEntry}
              onEdit={() => {
                if (onEditEntry) onEditEntry(viewingEntry);
                setViewingEntry(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={open => {
          if (!open) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Deleção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar este contato? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
