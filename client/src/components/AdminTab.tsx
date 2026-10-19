import AdminPanel from "./AdminPanel";
import ExportPatients from "./ExportPatients";
import ImportPatients from "./ImportPatients";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Users } from "lucide-react";

export default function AdminTab() {
  const [activeTab, setActiveTab] = useState<"users" | "export" | "import">("users");

  return (
    <div className="space-y-6">
      {/* Abas */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
        <Button
          variant={activeTab === "users" ? "default" : "ghost"}
          onClick={() => setActiveTab("users")}
          className="h-auto min-h-14 min-w-0 flex-col justify-center gap-1 rounded-xl whitespace-normal px-1 py-2 text-xs sm:min-h-11 sm:flex-row sm:gap-2 sm:px-2 sm:text-sm"
        >
          <Users className="w-4 h-4" />
          <span className="sm:hidden">Usuários</span><span className="hidden sm:inline">Gerenciar Usuários</span>
        </Button>
        <Button
          variant={activeTab === "export" ? "default" : "ghost"}
          onClick={() => setActiveTab("export")}
          className="h-auto min-h-14 min-w-0 flex-col justify-center gap-1 rounded-xl whitespace-normal px-1 py-2 text-xs sm:min-h-11 sm:flex-row sm:gap-2 sm:px-2 sm:text-sm"
        >
          <Download className="w-4 h-4" />
          <span className="sm:hidden">Exportar</span><span className="hidden sm:inline">Exportar Dados</span>
        </Button>
        <Button
          variant={activeTab === "import" ? "default" : "ghost"}
          onClick={() => setActiveTab("import")}
          className="h-auto min-h-14 min-w-0 flex-col justify-center gap-1 rounded-xl whitespace-normal px-1 py-2 text-xs sm:min-h-11 sm:flex-row sm:gap-2 sm:px-2 sm:text-sm"
        >
          <Upload className="w-4 h-4" />
          <span className="sm:hidden">Importar</span><span className="hidden sm:inline">Importar Dados</span>
        </Button>
      </div>

      {/* Conteúdo */}
      {activeTab === "users" && <AdminPanel />}
      {activeTab === "export" && <ExportPatients />}
      {activeTab === "import" && <ImportPatients />}
    </div>
  );
}
