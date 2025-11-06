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
import { Trash2, ChevronLeft, ChevronRight, Edit } from "lucide-react";

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
  const limit = 10;

  // Buscar pacientes
  const searchMutation = trpc.patients.search.useMutation();
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    searchMutation.mutate({
      name: filters.name || undefined,
      code: filters.code || undefined,
      birthDate: filters.birthDate || undefined,
      city: filters.city || undefined,
      limit,
      offset: page * limit,
    }, {
      onSuccess: (data) => {
        setPatients(data);
        setIsLoading(false);
      },
      onError: () => {
        setIsLoading(false);
      }
    });
  }, [filters, page]);

  // Deletar paciente
  const deletePatientMutation = trpc.patients.delete.useMutation({
    onSuccess: () => {
      toast.success("Paciente deletado com sucesso!");
      setDeleteId(null);
      // Limpar tela de busca
      setFilters({ name: "", code: "", birthDate: "", city: "" });
      setPage(0);
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
    setPage(0);
  };

  const handleDelete = () => {
    if (deleteId) {
      deletePatientMutation.mutate({ id: deleteId });
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-6">
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
        </div>
      </div>

      {/* Resultados */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-gray-600">
            Carregando pacientes...
          </div>
        ) : patients.length === 0 ? (
          <div className="p-6 text-center text-gray-600">
            Nenhum paciente encontrado
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell className="font-medium">{patient.name}</TableCell>
                    <TableCell>{patient.code || "-"}</TableCell>
                    <TableCell>{patient.city || "-"}</TableCell>
                    <TableCell>{patient.phone || "-"}</TableCell>
                    <TableCell>{patient.email || "-"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingPatient(patient);
                          if (onEditPatient) onEditPatient(patient);
                        }}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(patient.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginação */}
            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-gray-600">
                Página {page + 1} - {patients.length} resultados
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={patients.length < limit}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

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
          <div className="flex gap-4 justify-end">
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
