import AdminPanel from "./AdminPanel";
import ExportPatients from "./ExportPatients";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Users } from "lucide-react";

export default function AdminTab() {
  const [activeTab, setActiveTab] = useState<"users" | "export">("users");

  return (
    <div className="space-y-6">
      {/* Abas */}
      <div className="flex gap-4 border-b border-gray-200">
        <Button
          variant={activeTab === "users" ? "default" : "ghost"}
          onClick={() => setActiveTab("users")}
          className="flex items-center gap-2"
        >
          <Users className="w-4 h-4" />
          Gerenciar Usuários
        </Button>
        <Button
          variant={activeTab === "export" ? "default" : "ghost"}
          onClick={() => setActiveTab("export")}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Exportar Dados
        </Button>
      </div>

      {/* Conteúdo */}
      {activeTab === "users" && <AdminPanel />}
      {activeTab === "export" && <ExportPatients />}
    </div>
  );
}
