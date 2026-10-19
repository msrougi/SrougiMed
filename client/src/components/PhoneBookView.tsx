import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PhoneBookEntry {
  id: number;
  name: string;
  email?: string;
  occupation?: string;
  category?: string;
  phone?: string;
  observations?: string;
}

interface PhoneBookViewProps {
  entry: PhoneBookEntry;
  onEdit: () => void;
}

export default function PhoneBookView({ entry, onEdit }: PhoneBookViewProps) {
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const handleEditClick = () => {
    setShowEditConfirm(true);
  };

  const confirmEdit = () => {
    setShowEditConfirm(false);
    onEdit();
  };

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      {/* Informações Principais */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Informações do Contato</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Nome</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{entry.name || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">E-mail</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{entry.email || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Telefone</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{entry.phone || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Ocupação</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{entry.occupation || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Categoria</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{entry.category || "-"}</p>
          </div>
          {entry.observations && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Observações</label>
              <div className="mt-1 p-4 bg-gray-50 dark:bg-background rounded-lg border border-gray-200 dark:border-border">
                <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap">
                  {entry.observations}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex gap-2 justify-end pt-4 border-t">
        <Button
          type="button"
          variant="default"
          onClick={handleEditClick}
        >
          Editar
        </Button>
      </div>

      {/* Dialog de Confirmação de Edição */}
      <Dialog open={showEditConfirm} onOpenChange={setShowEditConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Edição</DialogTitle>
            <DialogDescription>
              Deseja realmente editar os dados de {entry.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowEditConfirm(false)}
            >
              Cancelar
            </Button>
            <Button onClick={confirmEdit}>
              Sim, Editar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
