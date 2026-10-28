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
import PatientView from "@/components/PatientView";
import { cpfSearchSchema } from "@shared/pagination";

interface PatientSearchProps {
  onEditPatient?: (patient: any) => void;
}

export default function PatientSearch({ onEditPatient }: PatientSearchProps) {
  const [filters, setFilters] = useState({
    name: "",
    code: "",
    cpf: "",
    birthDate: "",
    city: "",
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [viewingPatient, setViewingPatient] = useState<any | null>(null);

  // Buscar opções pré-cadastradas
  const { data: skinColors = [] } = trpc.patients.getSkinColors.useQuery();
  const { data: maritalStatuses = [] } =
    trpc.patients.getMaritalStatuses.useQuery();
  const { data: genders = [] } = trpc.patients.getGenders.useQuery();

  // Buscar pacientes
  const searchMutation = trpc.patients.searchPage.useMutation();
  const search = usePaginatedSearch((applied: typeof filters, page: number) =>
    searchMutation.mutateAsync({ ...applied, page, pageSize: 10 })
  );
  const { result, isLoading, hasSearched, error } = search;
  const patients = result?.items ?? [];

  // Deletar paciente
  const deletePatientMutation = trpc.patients.delete.useMutation({
    onSuccess: () => {
      toast.success("Paciente deletado com sucesso!");
      setDeleteId(null);
      // Limpar tela de busca
      setFilters({ name: "", code: "", cpf: "", birthDate: "", city: "" });
      search.reset();
    },
    onError: error => {
      toast.error(error.message || "Erro ao deletar paciente");
    },
  });

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value });
  };

  const handleSearch = () => {
    if (isLoading) return;
    const cpf = cpfSearchSchema.safeParse(filters.cpf);
    if (!cpf.success) {
      toast.error(cpf.error.issues[0].message);
      return;
    }
    // Validar se há pelo menos um campo com 2 ou mais caracteres
    const hasValidInput =
      (filters.name && filters.name.trim().length >= 2) ||
      (filters.code && /^[0-9]{1,8}$/.test(filters.code.trim())) ||
      Boolean(cpf.data) ||
      (filters.birthDate && filters.birthDate.trim().length >= 2) ||
      (filters.city && filters.city.trim().length >= 2);

    if (!hasValidInput) {
      toast.error("Informe um prontuário, um CPF completo ou pelo menos 2 caracteres nos demais campos para buscar");
      return;
    }

    search.search({ ...filters, cpf: cpf.data });
  };

  const handleDelete = () => {
    if (deleteId) {
      deletePatientMutation.mutate({ id: deleteId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <form
        onSubmit={event => {
          event.preventDefault();
          handleSearch();
        }}
        className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6"
      >
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">
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
            <Label htmlFor="code">Prontuário</Label>
            <Input
              inputMode="numeric"
              maxLength={8}
              id="code"
              name="code"
              value={filters.code}
              onChange={handleFilterChange}
              placeholder="Digite o prontuário"
            />
          </div>

          <div>
            <Label htmlFor="search-cpf">CPF</Label>
            <Input
              id="search-cpf"
              name="cpf"
              inputMode="numeric"
              maxLength={14}
              value={filters.cpf}
              onChange={handleFilterChange}
              placeholder="CPF com ou sem pontuação"
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
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              Buscar
            </Button>
          </div>
        </div>
      </form>

      {/* Resultados */}
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
            Digite os critérios de busca e pressione Enter ou clique em "Buscar" para encontrar
            pacientes
          </div>
        ) : isLoading ? (
          <div className="p-6 text-center text-gray-600 dark:text-slate-300">
            Carregando pacientes...
          </div>
        ) : !result ? null : patients.length === 0 ? (
          <div className="p-6 text-center text-gray-600 dark:text-slate-300">
            Nenhum paciente encontrado
          </div>
        ) : (
          <>
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Prontuário</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead className="sticky right-0 z-20 w-36 min-w-36 border-l bg-white dark:bg-card text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map(patient => (
                  <TableRow key={patient.id}>
                    <TableCell
                      data-label="Nome"
                      className="min-w-48 max-w-72 whitespace-normal [overflow-wrap:anywhere] font-medium"
                    >
                      {patient.name}
                    </TableCell>
                    <TableCell data-label="Prontuário">
                      {patient.code || "-"}
                    </TableCell>
                    <TableCell
                      data-label="Cidade"
                      className="max-w-60 whitespace-normal [overflow-wrap:anywhere]"
                    >
                      {patient.city || "-"}
                    </TableCell>
                    <TableCell
                      data-label="Telefone"
                      className="max-w-60 whitespace-normal [overflow-wrap:anywhere]"
                    >
                      {patient.phone || "-"}
                    </TableCell>
                    <TableCell
                      data-label="CPF"
                      className="max-w-60 whitespace-normal [overflow-wrap:anywhere]"
                    >
                      {patient.cpf || "-"}
                    </TableCell>
                    <TableCell
                      data-label="Ações"
                      className="record-actions sticky right-0 z-10 w-36 min-w-36 border-l bg-white dark:bg-card text-right"
                    >
                      <RecordActions
                        subject="paciente"
                        onView={() => setViewingPatient(patient)}
                        onEdit={() => {
                          onEditPatient?.(patient);
                        }}
                        onDelete={() => setDeleteId(patient.id)}
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
        open={viewingPatient !== null}
        onOpenChange={open => {
          if (!open) setViewingPatient(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Visualizar Paciente</DialogTitle>
          </DialogHeader>
          {viewingPatient && (
            <PatientView
              patient={viewingPatient}
              onEdit={() => {
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
              Tem certeza que deseja deletar este paciente? Esta ação não pode
              ser desfeita.
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
