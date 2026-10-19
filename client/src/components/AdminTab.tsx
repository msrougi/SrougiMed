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
      <div className="grid grid-cols-1 gap-2 border-b border-gray-200 pb-3 sm:grid-cols-3">
        <Button
          variant={activeTab === "users" ? "default" : "ghost"}
          onClick={() => setActiveTab("users")}
          className="h-auto min-h-11 min-w-0 justify-center gap-2 whitespace-normal px-2 py-2 text-sm"
        >
          <Users className="w-4 h-4" />
          Gerenciar Usuários
        </Button>
        <Button
          variant={activeTab === "export" ? "default" : "ghost"}
          onClick={() => setActiveTab("export")}
          className="h-auto min-h-11 min-w-0 justify-center gap-2 whitespace-normal px-2 py-2 text-sm"
        >
          <Download className="w-4 h-4" />
          Exportar Dados
        </Button>
        <Button
          variant={activeTab === "import" ? "default" : "ghost"}
          onClick={() => setActiveTab("import")}
          className="h-auto min-h-11 min-w-0 justify-center gap-2 whitespace-normal px-2 py-2 text-sm"
        >
          <Upload className="w-4 h-4" />
          Importar Dados
        </Button>
      </div>

      {/* Conteúdo */}
      {activeTab === "users" && <AdminPanel />}
      {activeTab === "export" && <ExportPatients />}
      {activeTab === "import" && <ImportPatients />}
    </div>
  );
}
