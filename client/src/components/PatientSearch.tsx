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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PatientView from "@/components/PatientView";

interface PatientSearchProps {
  onEditPatient?: (patient: any) => void;
}

export default function PatientSearch({ onEditPatient }: PatientSearchProps) {
  const [filters, setFilters] = useState({
    name: "",
    code: "",
    birthDate: "",
    city: "",
  });

  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingPatient, setEditingPatient] = useState<any | null>(null);
  const [viewingPatient, setViewingPatient] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const limit = 10;

  // Buscar opções pré-cadastradas
  const { data: skinColors = [] } = trpc.patients.getSkinColors.useQuery();
  const { data: maritalStatuses = [] } = trpc.patients.getMaritalStatuses.useQuery();
  const { data: genders = [] } = trpc.patients.getGenders.useQuery();

  // Buscar pacientes
  const searchMutation = trpc.patients.search.useMutation();
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const runSearch = async (offsetPage = 0) => {
    setIsLoading(true);
    try {
      const data = await searchMutation.mutateAsync({
        name: filters.name || undefined,
        code: filters.code || undefined,
        birthDate: filters.birthDate || undefined,
        city: filters.city || undefined,
        limit,
        offset: offsetPage * limit,
      });
      setPatients(data);
    } catch (error: any) {
      toast.error(error?.message || "Erro ao buscar pacientes");
      setPatients([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Deletar paciente
  const deletePatientMutation = trpc.patients.delete.useMutation({
    onSuccess: () => {
      toast.success("Paciente deletado com sucesso!");
      setDeleteId(null);
      // Limpar tela de busca
      setFilters({ name: "", code: "", birthDate: "", city: "" });
      setPage(0);
      setHasSearched(false);
      setPatients([]);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao deletar paciente");
    },
  });

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };

  const handleSearch = () => {
    // Validar se há pelo menos um campo com 2 ou mais caracteres
    const hasValidInput = 
      (filters.name && filters.name.trim().length >= 2) ||
      (filters.code && filters.code.trim().length >= 2) ||
      (filters.birthDate && filters.birthDate.trim().length >= 2) ||
      (filters.city && filters.city.trim().length >= 2);

    if (!hasValidInput) {
      toast.error("Digite pelo menos 2 caracteres em algum campo para buscar");
      return;
    }

    setHasSearched(true);
    setPage(0);
    void runSearch(0);
  };

  const handleDelete = () => {
    if (deleteId) {
      deletePatientMutation.mutate({ id: deleteId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Filtros de Busca
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Nome do Paciente</Label>
            <Input
              id="name"
              name="name"
              value={filters.name}
              onChange={handleFilterChange}
              placeholder="Digite o nome"
            />
          </div>

          <div>
            <Label htmlFor="code">Código</Label>
            <Input
              id="code"
              name="code"
              value={filters.code}
              onChange={handleFilterChange}
              placeholder="Digite o código"
            />
          </div>

          <div>
            <Label htmlFor="birthDate">Data de Nascimento</Label>
            <Input
              id="birthDate"
              name="birthDate"
              value={filters.birthDate}
              onChange={handleFilterChange}
              placeholder="DD/MM/YYYY"
            />
          </div>

          <div>
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              name="city"
              value={filters.city}
              onChange={handleFilterChange}
              placeholder="Digite a cidade"
            />
          </div>
          <div className="flex items-end [&>button]:w-full">
            <Button onClick={handleSearch} className="w-full">
              Buscar
            </Button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {!hasSearched ? (
          <div className="p-6 text-center text-gray-600">
            Digite os critérios de busca e clique em "Buscar" para encontrar pacientes
          </div>
        ) : isLoading ? (
          <div className="p-6 text-center text-gray-600">
            Carregando pacientes...
          </div>
        ) : patients.length === 0 ? (
          <div className="p-6 text-center text-gray-600">
            Nenhum paciente encontrado
          </div>
        ) : (
          <>
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="sticky right-0 z-20 w-36 min-w-36 border-l bg-white text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell data-label="Nome" className="min-w-48 max-w-72 whitespace-normal [overflow-wrap:anywhere] font-medium">{patient.name}</TableCell>
                    <TableCell data-label="Código">{patient.code || "-"}</TableCell>
                    <TableCell data-label="Cidade" className="max-w-60 whitespace-normal [overflow-wrap:anywhere]">{patient.city || "-"}</TableCell>
                    <TableCell data-label="Telefone" className="max-w-60 whitespace-normal [overflow-wrap:anywhere]">{patient.phone || "-"}</TableCell>
                    <TableCell data-label="E-mail" className="max-w-60 whitespace-normal [overflow-wrap:anywhere]">{patient.email || "-"}</TableCell>
                    <TableCell data-label="Ações" className="record-actions sticky right-0 z-10 w-36 min-w-36 border-l bg-white text-right">
                      <RecordActions subject="paciente" onView={() => setViewingPatient(patient)}
                        onEdit={() => { setEditingPatient(patient); onEditPatient?.(patient); }} onDelete={() => setDeleteId(patient.id)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginação */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t">
              <div className="text-sm text-gray-600">
                Página {page + 1} - {patients.length} resultados
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextPage = Math.max(0, page - 1);
                    setPage(nextPage);
                    void runSearch(nextPage);
                  }}
                  aria-label="Página anterior"
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const nextPage = page + 1;
                    setPage(nextPage);
                    void runSearch(nextPage);
                  }}
                  aria-label="Próxima página"
                  disabled={patients.length < limit}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dialog de Visualização */}
      <Dialog open={viewingPatient !== null} onOpenChange={(open) => {
        if (!open) setViewingPatient(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Paciente</DialogTitle>
          </DialogHeader>
          {viewingPatient && (
            <PatientView
              patient={viewingPatient}
              onEdit={() => {
                setEditingPatient(viewingPatient);
                if (onEditPatient) onEditPatient(viewingPatient);
                setViewingPatient(null);
              }}
              skinColors={skinColors}
              maritalStatuses={maritalStatuses}
              genders={genders}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Deleção */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => {
        if (!open) setDeleteId(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Deleção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar este paciente? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deletePatientMutation.isPending}
            >
              {deletePatientMutation.isPending ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

