import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, UserPlus } from "lucide-react";
import PhoneBookForm from "./PhoneBookForm";
import PhoneBookSearch from "./PhoneBookSearch";

export default function PhoneBookTab() {
  const [showSearch, setShowSearch] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);

  const handleFormSuccess = () => {
    setShowRegister(false);
    setEditingEntry(null);
    setRefreshKey((prev) => prev + 1);
  };

  const handleEditEntry = (entry: any) => {
    setEditingEntry(entry);
    setShowSearch(false);
    setShowRegister(true);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Agenda Telefônica
        </h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Button
            onClick={() => {
              setShowSearch(!showSearch);
              setShowRegister(false);
            }}
            className="flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Buscar
          </Button>

          <Button
            onClick={() => {
              setShowRegister(!showRegister);
              setShowSearch(false);
            }}
            className="flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Cadastrar
          </Button>
        </div>
      </div>

      {showSearch && (
        <div key={refreshKey}>
          <PhoneBookSearch onEditEntry={handleEditEntry} />
        </div>
      )}

      {showRegister && (
        <div>
          <PhoneBookForm onSuccess={handleFormSuccess} initialData={editingEntry} />
        </div>
      )}
    </div>
  );
}
