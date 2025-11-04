import { Button } from "@/components/ui/button";
import { UserPlus, Users } from "lucide-react";

export default function AdminTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Administração de Usuários</h2>
        
        <div className="flex gap-4 mb-6">
          <Button className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Criar Usuário
          </Button>
          
          <Button variant="outline" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Listar Usuários
          </Button>
        </div>

        <div className="p-6 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Gerenciamento de Usuários</h3>
          <p className="text-gray-600">Funcionalidade de administração em desenvolvimento...</p>
        </div>
      </div>
    </div>
  );
}
