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
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-center text-lg font-semibold tracking-tight text-[#1e3a5f] sm:mb-6 sm:text-left sm:text-2xl">
          Cadastro de Pacientes
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <Button
            onClick={() => {
              setShowSearch(!showSearch);
              setShowRegister(false);
            }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#087e78] text-white hover:bg-[#06665f] sm:min-h-11"
          >
            <Search className="w-4 h-4" />
            Buscar
          </Button>

          <Button
            onClick={() => {
              setShowRegister(!showRegister);
              setShowSearch(false);
            }}
            variant="outline"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-teal-100 bg-teal-50 text-[#087e78] hover:bg-teal-100 sm:min-h-11"
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
