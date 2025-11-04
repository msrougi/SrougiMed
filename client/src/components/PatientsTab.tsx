import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, UserPlus } from "lucide-react";

export default function PatientsTab() {
  const [showSearch, setShowSearch] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Cadastro de Pacientes</h2>
        
        <div className="flex gap-4">
          <Button
            onClick={() => {
              setShowSearch(!showSearch);
              setShowRegister(false);
            }}
            className="flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Buscar
          </Button>
          
          <Button
            onClick={() => {
              setShowRegister(!showRegister);
              setShowSearch(false);
            }}
            className="flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Cadastrar
          </Button>
        </div>

        {showSearch && (
          <div className="mt-6 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Buscar Paciente</h3>
            <p className="text-gray-600">Funcionalidade de busca em desenvolvimento...</p>
          </div>
        )}

        {showRegister && (
          <div className="mt-6 p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Cadastrar Novo Paciente</h3>
            <p className="text-gray-600">Formulário de cadastro em desenvolvimento...</p>
          </div>
        )}
      </div>
    </div>
  );
}
