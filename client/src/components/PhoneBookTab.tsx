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
      <div className="rounded-2xl border border-slate-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-center text-lg font-semibold tracking-tight text-brand sm:mb-6 sm:text-left sm:text-2xl">
          Agenda Telefônica
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
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-teal-100 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 text-brand hover:bg-teal-100 dark:hover:bg-teal-900/50 sm:min-h-11"
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
