import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RecordActions({ subject, onView, onEdit, onDelete }: {
  subject: "paciente" | "contato";
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return <div className="grid grid-cols-3 gap-2 md:flex md:justify-end md:gap-1">
    {[
      { label: "Visualizar", Icon: Eye, action: onView, color: "text-green-700 hover:bg-green-50" },
      { label: "Editar", Icon: Pencil, action: onEdit, color: "text-[#087e78] hover:bg-teal-50" },
      { label: "Deletar", Icon: Trash2, action: onDelete, color: "text-red-700 hover:bg-red-50" },
    ].map(({ label, Icon, action, color }) => <Button
      key={label} type="button" variant="ghost" onClick={action}
      aria-label={`${label} ${subject}`} title={`${label} ${subject}`}
      className={`h-auto min-h-14 min-w-0 flex-col gap-1 px-1 py-2 text-xs md:h-9 md:min-h-0 md:w-9 md:p-0 ${color}`}
    >
      <Icon className="h-4 w-4" />
      <span className="md:sr-only">{label}</span>
    </Button>)}
  </div>;
}
