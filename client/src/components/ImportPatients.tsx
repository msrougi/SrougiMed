import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { parseCSV, parseExcel } from "@/lib/importUtils";
import { toast } from "sonner";
import { Upload, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

export default function ImportPatients() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const importMutation = trpc.importData.importPatients.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Importação concluída: ${result.successCount} pacientes importados com sucesso`
      );
      if (result.errorCount > 0) {
        toast.warning(`${result.errorCount} pacientes com erro`);
      }
      setSelectedFile(null);
      setParsedData([]);
      setShowConfirm(false);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao importar pacientes");
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      let data;

      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        data = parseCSV(text);
      } else if (
        file.name.endsWith(".xlsx") ||
        file.name.endsWith(".xls")
      ) {
        data = await parseExcel(file);
      } else {
        toast.error("Formato de arquivo não suportado. Use CSV ou Excel.");
        return;
      }

      if (data.length === 0) {
        toast.error("Nenhum paciente válido encontrado no arquivo");
        return;
      }

      setSelectedFile(file);
      setParsedData(data);
      toast.success(`${data.length} pacientes encontrados no arquivo`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao processar arquivo"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = () => {
    if (parsedData.length === 0) {
      toast.error("Nenhum dado para importar");
      return;
    }

    importMutation.mutate(parsedData);
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Importar Pacientes
        </h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="file-upload">
              Selecione um arquivo CSV ou Excel
            </Label>
            <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                disabled={isProcessing}
                className="min-w-0 flex-1"
              />
              {selectedFile && (
                <div className="min-w-0 break-all text-sm text-green-600 font-medium">
                  ✓ {selectedFile.name}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
            <p className="text-sm text-teal-800">
              <strong>Formato esperado:</strong> O arquivo deve conter colunas
              com nomes como "Nome", "Telefone", "E-mail", "Cidade", etc. A
              coluna "Nome" é obrigatória.
            </p>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {parsedData.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Pré-visualização ({parsedData.length} pacientes)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Ocupação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.slice(0, 10).map((patient, idx) => (
                  <TableRow key={idx}>
                    <TableCell data-label="Nome" className="font-medium">
                      {patient.name}
                    </TableCell>
                    <TableCell data-label="Telefone">{patient.phone || "-"}</TableCell>
                    <TableCell data-label="E-mail">{patient.email || "-"}</TableCell>
                    <TableCell data-label="Cidade">{patient.city || "-"}</TableCell>
                    <TableCell data-label="Ocupação">{patient.occupation || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {parsedData.length > 10 && (
            <div className="mt-4 text-sm text-gray-600">
              ... e mais {parsedData.length - 10} pacientes
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Importar Pacientes
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedFile(null);
                setParsedData([]);
              }}
              disabled={importMutation.isPending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              Confirmar Importação
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a importar {parsedData.length} pacientes. Esta
              ação não pode ser desfeita. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleImport}
              className="bg-green-600 hover:bg-green-700"
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? "Importando..." : "Confirmar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
