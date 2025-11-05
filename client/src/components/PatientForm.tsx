import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { X } from "lucide-react";

interface PatientFormProps {
  onSuccess?: () => void;
}

export default function PatientForm({ onSuccess }: PatientFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
    mobile: "",
    skinColorId: "",
    city: "",
    state: "",
    rg: "",
    cpf: "",
    birthDate: "",
    birthPlace: "",
    maritalStatusId: "",
    genderId: "",
    email: "",
    referredBy: "",
    registrationDate: new Date().toLocaleDateString("pt-BR"),
    occupation: "",
    additionalInfo1: "",
    additionalInfo2: "",
    notes: "",
  });

  const [age, setAge] = useState<number | null>(null);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesText, setNotesText] = useState("");

  // Buscar opções pré-cadastradas
  const { data: skinColors = [] } = trpc.patients.getSkinColors.useQuery();
  const { data: maritalStatuses = [] } = trpc.patients.getMaritalStatuses.useQuery();
  const { data: genders = [] } = trpc.patients.getGenders.useQuery();

  // Mutation para criar paciente
  const createPatientMutation = trpc.patients.create.useMutation({
    onSuccess: () => {
      toast.success("Paciente cadastrado com sucesso!");
      resetForm();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao cadastrar paciente");
    },
  });

  // Calcular idade automaticamente
  useEffect(() => {
    if (formData.birthDate && formData.birthDate.length === 10) {
      const [day, month, year] = formData.birthDate.split("/").map(Number);
      const birthDate = new Date(year, month - 1, day);
      const today = new Date();

      if (!isNaN(birthDate.getTime()) && birthDate <= today) {
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();

        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birthDate.getDate())
        ) {
          calculatedAge--;
        }

        if (calculatedAge >= 0 && calculatedAge <= 150) {
          setAge(calculatedAge);
        } else {
          setAge(null);
        }
      } else {
        setAge(null);
      }
    } else {
      setAge(null);
    }
  }, [formData.birthDate]);

  // Formatar data enquanto digita - permite deleção completa
  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Se vazio, permite deleção completa
    if (value === "") {
      setFormData({ ...formData, birthDate: "" });
      return;
    }

    // Remove tudo que não é dígito
    let digitsOnly = value.replace(/\D/g, "");

    // Limita a 8 dígitos
    if (digitsOnly.length > 8) {
      digitsOnly = digitsOnly.slice(0, 8);
    }

    // Formata como DD/MM/YYYY
    let formatted = digitsOnly;
    if (digitsOnly.length >= 2) {
      formatted = digitsOnly.slice(0, 2) + "/" + digitsOnly.slice(2);
    }
    if (digitsOnly.length >= 4) {
      formatted = digitsOnly.slice(0, 2) + "/" + digitsOnly.slice(2, 4) + "/" + digitsOnly.slice(4);
    }

    setFormData({ ...formData, birthDate: formatted });
  };

  // Formatar CPF enquanto digita - XXX.XXX.XXX-XX
  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Se vazio, permite deleção completa
    if (value === "") {
      setFormData({ ...formData, cpf: "" });
      return;
    }

    // Remove tudo que não é dígito
    let digitsOnly = value.replace(/\D/g, "");

    // Limita a 11 dígitos
    if (digitsOnly.length > 11) {
      digitsOnly = digitsOnly.slice(0, 11);
    }

    // Formata como XXX.XXX.XXX-XX
    let formatted = digitsOnly;
    if (digitsOnly.length >= 3) {
      formatted = digitsOnly.slice(0, 3) + "." + digitsOnly.slice(3);
    }
    if (digitsOnly.length >= 6) {
      formatted = digitsOnly.slice(0, 3) + "." + digitsOnly.slice(3, 6) + "." + digitsOnly.slice(6);
    }
    if (digitsOnly.length >= 9) {
      formatted = digitsOnly.slice(0, 3) + "." + digitsOnly.slice(3, 6) + "." + digitsOnly.slice(6, 9) + "-" + digitsOnly.slice(9);
    }

    setFormData({ ...formData, cpf: formatted });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      phone: "",
      mobile: "",
      skinColorId: "",
      city: "",
      state: "",
      rg: "",
      cpf: "",
      birthDate: "",
      birthPlace: "",
      maritalStatusId: "",
      genderId: "",
      email: "",
      referredBy: "",
      registrationDate: new Date().toLocaleDateString("pt-BR"),
      occupation: "",
      additionalInfo1: "",
      additionalInfo2: "",
      notes: "",
    });
    setAge(null);
    setNotesText("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Nome do paciente é obrigatório");
      return;
    }

    // Validar campos numéricos
    if (formData.phone && !/^\d{0,10}$/.test(formData.phone)) {
      toast.error("Telefone deve conter até 10 dígitos numéricos");
      return;
    }

    if (formData.mobile && !/^\d{0,11}$/.test(formData.mobile)) {
      toast.error("Celular deve conter até 11 dígitos numéricos");
      return;
    }

    // Preparar dados para envio
    const submitData = {
      name: formData.name,
      address: formData.address || undefined,
      phone: formData.phone || undefined,
      mobile: formData.mobile || undefined,
      skinColorId: formData.skinColorId ? parseInt(formData.skinColorId) : undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      rg: formData.rg || undefined,
      cpf: formData.cpf || undefined,
      birthDate: formData.birthDate || undefined,
      birthPlace: formData.birthPlace || undefined,
      maritalStatusId: formData.maritalStatusId ? parseInt(formData.maritalStatusId) : undefined,
      genderId: formData.genderId ? parseInt(formData.genderId) : undefined,
      email: formData.email || undefined,
      referredBy: formData.referredBy || undefined,
      registrationDate: formData.registrationDate || undefined,
      occupation: formData.occupation || undefined,
      additionalInfo1: formData.additionalInfo1 || undefined,
      additionalInfo2: formData.additionalInfo2 || undefined,
      notes: notesText || undefined,
    };

    createPatientMutation.mutate(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Seção 1: Informações Básicas */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Informações Básicas
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Nome completo"
              maxLength={200}
              required
            />
          </div>

          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="email@exemplo.com"
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              name="cpf"
              value={formData.cpf}
              onChange={handleCPFChange}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>
        </div>
      </div>

      {/* Seção 2: Contato */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Contato</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="Telefone"
              maxLength={10}
              type="tel"
            />
          </div>

          <div>
            <Label htmlFor="mobile">Celular</Label>
            <Input
              id="mobile"
              name="mobile"
              value={formData.mobile}
              onChange={handleInputChange}
              placeholder="Celular"
              maxLength={11}
              type="tel"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              placeholder="Endereço completo"
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="city">Cidade</Label>
            <Input
              id="city"
              name="city"
              value={formData.city}
              onChange={handleInputChange}
              placeholder="Cidade"
              maxLength={100}
            />
          </div>

          <div>
            <Label htmlFor="state">Estado</Label>
            <Input
              id="state"
              name="state"
              value={formData.state}
              onChange={handleInputChange}
              placeholder="Estado"
              maxLength={100}
            />
          </div>
        </div>
      </div>

      {/* Seção 3: Dados Pessoais */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Dados Pessoais
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="birthDate">Data de Nascimento</Label>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  id="birthDate"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleBirthDateChange}
                  placeholder="DD/MM/YYYY"
                  maxLength={10}
                />
              </div>
              {age !== null && (
                <div className="text-sm font-semibold text-[#0d9488] whitespace-nowrap">
                  {age} anos
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="rg">RG</Label>
            <Input
              id="rg"
              name="rg"
              value={formData.rg}
              onChange={handleInputChange}
              placeholder="RG"
              maxLength={100}
            />
          </div>

          <div>
            <Label htmlFor="birthPlace">Natural de</Label>
            <Input
              id="birthPlace"
              name="birthPlace"
              value={formData.birthPlace}
              onChange={handleInputChange}
              placeholder="Naturalidade"
              maxLength={100}
            />
          </div>

          <div>
            <Label htmlFor="genderId">Sexo</Label>
            <Select
              value={formData.genderId}
              onValueChange={(value) => handleSelectChange("genderId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o sexo" />
              </SelectTrigger>
              <SelectContent>
                {genders.map((gender) => (
                  <SelectItem key={gender.id} value={gender.id.toString()}>
                    {gender.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="skinColorId">Cor da Pele</Label>
            <Select
              value={formData.skinColorId}
              onValueChange={(value) => handleSelectChange("skinColorId", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a cor da pele" />
              </SelectTrigger>
              <SelectContent>
                {skinColors.map((color) => (
                  <SelectItem key={color.id} value={color.id.toString()}>
                    {color.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="maritalStatusId">Estado Civil</Label>
            <Select
              value={formData.maritalStatusId}
              onValueChange={(value) =>
                handleSelectChange("maritalStatusId", value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o estado civil" />
              </SelectTrigger>
              <SelectContent>
                {maritalStatuses.map((status) => (
                  <SelectItem key={status.id} value={status.id.toString()}>
                    {status.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Seção 4: Informações Profissionais e Adicionais */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Informações Adicionais
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="occupation">Ocupação</Label>
            <Input
              id="occupation"
              name="occupation"
              value={formData.occupation}
              onChange={handleInputChange}
              placeholder="Profissão/Ocupação"
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="referredBy">Indicado Por</Label>
            <Input
              id="referredBy"
              name="referredBy"
              value={formData.referredBy}
              onChange={handleInputChange}
              placeholder="Quem indicou"
              maxLength={100}
            />
          </div>

          <div>
            <Label htmlFor="registrationDate">Data de Cadastro</Label>
            <Input
              id="registrationDate"
              name="registrationDate"
              value={formData.registrationDate}
              onChange={handleInputChange}
              disabled
              className="bg-gray-100"
            />
          </div>

          <div>
            <Label htmlFor="additionalInfo1">Info Adicional 1</Label>
            <Input
              id="additionalInfo1"
              name="additionalInfo1"
              value={formData.additionalInfo1}
              onChange={handleInputChange}
              placeholder="Informação adicional"
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="additionalInfo2">Info Adicional 2</Label>
            <Input
              id="additionalInfo2"
              name="additionalInfo2"
              value={formData.additionalInfo2}
              onChange={handleInputChange}
              placeholder="Informação adicional"
              maxLength={200}
            />
          </div>
        </div>
      </div>

      {/* Seção 5: Notas */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Notas</h3>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowNotesDialog(true)}
          >
            Adicionar Notas
          </Button>
        </div>

        {notesText && (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex justify-between items-start">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {notesText}
              </p>
              <button
                type="button"
                onClick={() => setNotesText("")}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex gap-4">
        <Button
          type="submit"
          className="flex-1 bg-[#0d9488] hover:bg-[#0d7a6d]"
          disabled={createPatientMutation.isPending}
        >
          {createPatientMutation.isPending ? "Salvando..." : "Cadastrar Paciente"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={resetForm}
          disabled={createPatientMutation.isPending}
        >
          Limpar
        </Button>
      </div>

      {/* Dialog para Notas */}
      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Notas</DialogTitle>
            <DialogDescription>
              Adicione informações adicionais sobre o paciente (máximo 2000 caracteres)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Digite as notas aqui..."
              maxLength={2000}
              rows={6}
            />
            <div className="text-sm text-gray-500">
              {notesText.length}/2000 caracteres
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowNotesDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => setShowNotesDialog(false)}
                className="bg-[#0d9488] hover:bg-[#0d7a6d]"
              >
                Salvar Notas
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
