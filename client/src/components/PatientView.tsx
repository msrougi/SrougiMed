import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye } from "lucide-react";

interface Patient {
  id: number;
  name: string;
  code?: string;
  address?: string;
  district?: string | null;
  cep?: string;
  phone?: string;
  mobile?: string;
  fax?: string | null;
  skinColorId?: number;
  city?: string;
  state?: string;
  rg?: string;
  cpf?: string;
  birthDate?: string;
  birthPlace?: string;
  motherName?: string | null;
  fatherName?: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  maritalStatusId?: number;
  genderId?: number;
  email?: string;
  referredBy?: string;
  registrationDate?: string;
  occupation?: string;
  additionalInfo1?: string;
  additionalInfo2?: string;
  notes?: string;
}

interface PatientViewProps {
  patient: Patient;
  onEdit: () => void;
  skinColors: { id: number; name: string }[];
  maritalStatuses: { id: number; name: string }[];
  genders: { id: number; name: string }[];
}

export default function PatientView({
  patient,
  onEdit,
  skinColors,
  maritalStatuses,
  genders,
}: PatientViewProps) {
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);

  const getSkinColorName = (id?: number) => {
    if (!id) return "-";
    return skinColors.find((s) => s.id === id)?.name || "-";
  };

  const getMaritalStatusName = (id?: number) => {
    if (!id) return "-";
    return maritalStatuses.find((m) => m.id === id)?.name || "-";
  };

  const getGenderName = (id?: number) => {
    if (!id) return "-";
    return genders.find((g) => g.id === id)?.name || "-";
  };

  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return "-";
    const parts = birthDate.split("/");
    if (parts.length !== 3) return "-";
    const birth = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleEditClick = () => {
    setShowEditConfirm(true);
  };

  const confirmEdit = () => {
    setShowEditConfirm(false);
    onEdit();
  };

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      {/* Informações Pessoais */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Informações Pessoais</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Nome</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.name || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Prontuário</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.code || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">CPF</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.cpf || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">RG</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.rg || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Data de Nascimento</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">
              {patient.birthDate || "-"}
              {patient.birthDate && ` (${calculateAge(patient.birthDate)} anos)`}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Natural de</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.birthPlace || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Nome da mãe</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.motherName || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Nome do pai</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.fatherName || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Sexo</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{getGenderName(patient.genderId)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Estado Civil</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{getMaritalStatusName(patient.maritalStatusId)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Cor da Pele</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{getSkinColorName(patient.skinColorId)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Ocupação</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.occupation || "-"}</p>
          </div>
        </div>
      </div>

      {/* Contato */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Contato</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">E-mail</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.email || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Telefone</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.phone || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Celular</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.mobile || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Fax</label>
            <p className="mt-1 break-words text-sm text-gray-900 dark:text-slate-100">{patient.fax || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Nome do responsável</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.responsibleName || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Telefone do responsável</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.responsiblePhone || "-"}</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Endereço</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.address || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Bairro</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.district || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">CEP</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.cep || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Cidade</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.city || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Estado</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.state || "-"}</p>
          </div>
        </div>
      </div>

      {/* Informações Adicionais */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Informações Adicionais</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Indicado Por</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.referredBy || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Data de Cadastro</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.registrationDate || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Info Adicional 1</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.additionalInfo1 || "-"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-200">Info Adicional 2</label>
            <p className="mt-1 text-sm text-gray-900 dark:text-slate-100">{patient.additionalInfo2 || "-"}</p>
          </div>
        </div>
      </div>

      {/* Notas */}
      {patient.notes && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowNotesDialog(true)}
            className="w-full md:w-auto"
          >
            <Eye className="w-4 h-4 mr-2" />
            Ver Notas
          </Button>
        </div>
      )}

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

      {/* Dialog de Notas */}
      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Notas do Paciente</DialogTitle>
            <DialogDescription>
              Informações adicionais sobre {patient.name}
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-gray-50 dark:bg-background rounded-lg border border-gray-200 dark:border-border max-h-[50dvh] overflow-y-auto">
            <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap">
              {patient.notes}
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowNotesDialog(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Edição */}
      <Dialog open={showEditConfirm} onOpenChange={setShowEditConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Edição</DialogTitle>
            <DialogDescription>
              Deseja realmente editar os dados de {patient.name}?
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

