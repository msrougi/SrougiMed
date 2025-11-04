import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, UserPlus } from "lucide-react";
import PhoneBookForm from "./PhoneBookForm";
import PhoneBookSearch from "./PhoneBookSearch";

export default function PhoneBookTab() {
  const [showSearch, setShowSearch] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleFormSuccess = () => {
    setShowRegister(false);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Agenda Telefônica
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
          <PhoneBookSearch />
        </div>
      )}

      {showRegister && (
        <div>
          <PhoneBookForm onSuccess={handleFormSuccess} />
        </div>
      )}
    </div>
  );
}
