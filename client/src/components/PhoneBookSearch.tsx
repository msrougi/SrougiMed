import RecordActions from "./RecordActions";
import { useState, useEffect } from "react";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PhoneBookView from "@/components/PhoneBookView";

interface PhoneBookSearchProps {
  onEditEntry?: (entry: any) => void;
}

export default function PhoneBookSearch({ onEditEntry }: PhoneBookSearchProps) {
  const [searchName, setSearchName] = useState("");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewingEntry, setViewingEntry] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const limit = 10;

  const searchMutation = trpc.phoneBook.search.useMutation();
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = () => {
    if (!searchName.trim()) {
      toast.error("Digite um nome para buscar");
      return;
    }
    if (searchName.trim().length < 2) {
      toast.error("Digite pelo menos 2 caracteres para buscar");
      return;
    }
    setPage(0);
    setHasSearched(true);
    setIsLoading(true);
    searchMutation.mutate({
      name: searchName,
      limit,
      offset: 0,
    }, {
      onSuccess: (data) => {
        setEntries(data);
        setIsLoading(false);
      },
      onError: () => {
        setIsLoading(false);
      }
    });
  };

  // Carregar próximas páginas quando page mudar
  useEffect(() => {
    if (hasSearched && page > 0) {
      setIsLoading(true);
      searchMutation.mutate({
        name: searchName,
        limit,
        offset: page * limit,
      }, {
        onSuccess: (data) => {
          setEntries(data);
          setIsLoading(false);
        },
        onError: () => {
          setIsLoading(false);
        }
      });
    }
  }, [page, hasSearched]);

  const deleteMutation = trpc.phoneBook.delete.useMutation({
    onSuccess: () => {
      toast.success("Contato deletado com sucesso!");
      setDeleteId(null);
      // Limpar tela de busca e remover o resultado excluído imediatamente.
      setSearchName("");
      setPage(0);
      setHasSearched(false);
      setEntries([]);
    },
    onError: (error) => {
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
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Buscar Contato
        </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <div className="min-w-0 flex-1">
              <Label htmlFor="search">Nome do Contato</Label>
              <Input
                id="search"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Digite o nome para buscar"
              />
            </div>
            <div className="flex items-end [&>button]:w-full">
              <Button onClick={handleSearch} className="bg-[#087e78] hover:bg-[#06665f]">
                Buscar
              </Button>
            </div>
          </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {!hasSearched ? (
          <div className="p-6 text-center text-gray-600">
            Digite um nome e clique em "Buscar" para encontrar contatos
          </div>
        ) : isLoading ? (
          <div className="p-6 text-center text-gray-600">
            Carregando contatos...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-gray-600">
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
                  <TableHead className="sticky right-0 z-20 w-36 min-w-36 border-l bg-white text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell data-label="Nome" className="min-w-48 max-w-72 whitespace-normal break-words font-medium">{entry.name}</TableCell>
                    <TableCell data-label="Telefone" className="max-w-60 whitespace-normal break-words">{entry.phone || "-"}</TableCell>
                    <TableCell data-label="E-mail" className="max-w-60 whitespace-normal [overflow-wrap:anywhere]">{entry.email || "-"}</TableCell>
                    <TableCell data-label="Ocupação" className="max-w-48 whitespace-normal break-words">{entry.occupation || "-"}</TableCell>
                    <TableCell data-label="Categoria" className="max-w-48 whitespace-normal break-words">{entry.category || "-"}</TableCell>
                    <TableCell data-label="Ações" className="record-actions sticky right-0 z-10 w-36 min-w-36 border-l bg-white text-right">
                      <RecordActions subject="contato" onView={() => setViewingEntry(entry)}
                        onEdit={() => { onEditEntry?.(entry); }} onDelete={() => setDeleteId(entry.id)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t">
              <div className="text-sm text-gray-600">
                Página {page + 1} - {entries.length} resultados
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  aria-label="Página anterior"
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  aria-label="Próxima página"
                  disabled={entries.length < limit}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dialog de Visualização */}
      <Dialog open={viewingEntry !== null} onOpenChange={(open) => {
        if (!open) setViewingEntry(null);
      }}>
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

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => {
        if (!open) setDeleteId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Deleção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar este contato? Esta ação não pode ser desfeita.
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

