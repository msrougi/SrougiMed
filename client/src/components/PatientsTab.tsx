import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, UserPlus } from "lucide-react";
import PatientForm from "./PatientForm";
import PatientSearch from "./PatientSearch";

export default function PatientsTab() {
  const [showSearch, setShowSearch] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingPatient, setEditingPatient] = useState<any | null>(null);

  const handleFormSuccess = () => {
    setShowRegister(false);
    setEditingPatient(null);
    setRefreshKey((prev) => prev + 1);
  };

  const handleEditPatient = (patient: any) => {
    setEditingPatient(patient);
    setShowSearch(false);
    setShowRegister(true);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Cadastro de Pacientes
        </h2>

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
      </div>

      {showSearch && (
        <div key={refreshKey}>
          <PatientSearch onEditPatient={handleEditPatient} />
        </div>
      )}

      {showRegister && (
        <div>
          <PatientForm onSuccess={handleFormSuccess} initialData={editingPatient} />
        </div>
      )}
    </div>
  );
}
