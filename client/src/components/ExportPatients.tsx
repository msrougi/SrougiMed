import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { patientsToCSV, downloadCSV, patientsToExcel } from "@/lib/exportUtils";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";

export default function ExportPatients() {
  const [isExporting, setIsExporting] = useState(false);

  // Buscar todos os pacientes
  const { data: patients = [] } = trpc.export.getAllPatients.useQuery();

  const handleExportCSV = () => {
    try {
      setIsExporting(true);

      if (patients.length === 0) {
        toast.error("Nenhum paciente para exportar");
        return;
      }

      const csvContent = patientsToCSV(patients);
      const filename = `pacientes_${new Date().toISOString().split("T")[0]}.csv`;
      downloadCSV(csvContent, filename);

      toast.success(`${patients.length} pacientes exportados para CSV`);
    } catch (error) {
      console.error("Erro ao exportar CSV:", error);
      toast.error("Erro ao exportar para CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);

      if (patients.length === 0) {
        toast.error("Nenhum paciente para exportar");
        return;
      }

      const filename = `pacientes_${new Date().toISOString().split("T")[0]}.xlsx`;
      await patientsToExcel(patients, filename);

      toast.success(`${patients.length} pacientes exportados para Excel`);
    } catch (error) {
      console.error("Erro ao exportar Excel:", error);
      toast.error("Erro ao exportar para Excel. Certifique-se de que o pacote 'xlsx' está instalado.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
            Exportar Dados de Pacientes
          </h3>
          <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">
            Total de pacientes: <strong>{patients.length}</strong>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Button
          onClick={handleExportCSV}
          disabled={isExporting || patients.length === 0}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          Exportar CSV
        </Button>

        <Button
          onClick={handleExportExcel}
          disabled={isExporting || patients.length === 0}
          className="flex items-center gap-2 bg-[#087e78] hover:bg-[#06665f]"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileDown className="w-4 h-4" />
          )}
          Exportar Excel
        </Button>
      </div>

      <div className="mt-6 p-4 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 rounded-lg">
        <p className="text-sm text-teal-800 dark:text-teal-200">
          <strong>Informação:</strong> Os arquivos exportados incluem todos os dados dos pacientes
          cadastrados no sistema, incluindo informações pessoais, contato e dados adicionais.
        </p>
      </div>
    </div>
  );
}
