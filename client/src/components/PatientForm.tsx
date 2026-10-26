import { recordNumberSchema, RECORD_NUMBER_MAX_LENGTH } from "@shared/recordNumber";
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
import { X, CheckCircle2, AlertCircle } from "lucide-react";

interface PatientFormProps {
  onSuccess?: () => void;
  initialData?: any;
}

const defaultFormData = {
  code: "",
  name: "",
  address: "",
  district: "",
  cep: "",
  phone: "",
  mobile: "",
  fax: "",
  skinColorId: "",
  city: "",
  state: "",
  rg: "",
  cpf: "",
  birthDate: "",
  birthPlace: "",
  motherName: "",
  fatherName: "",
  responsibleName: "",
  responsiblePhone: "",
  maritalStatusId: "",
  genderId: "",
  email: "",
  referredBy: "",
  registrationDate: new Date().toLocaleDateString("pt-BR"),
  occupation: "",
  additionalInfo1: "",
  additionalInfo2: "",
  notes: "",
};

export default function PatientForm({ onSuccess, initialData }: PatientFormProps) {

  const isLegacy = Boolean(initialData?.id && initialData?.legacyImported);
  const [age, setAge] = useState<number | null>(null);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [cpfValidation, setCpfValidation] = useState<"valid" | "invalid" | null>(null);

  // Inicializar formData com valores padrão
  const [formData, setFormData] = useState(() => {
    if (initialData?.id) {
      // Se há dados iniciais, mesclar com valores padrão
      return Object.entries(defaultFormData).reduce((acc, [key, defaultValue]) => {
        const value = initialData[key];
        acc[key] = value === null || value === undefined ? (key === "registrationDate" ? "" : defaultValue) : value;
        return acc;
      }, {} as any);
    }
    return defaultFormData;
  });

  // Função para validar CPF
  const validateCPF = (cpf: string): boolean => {
    // Remove formatação
    const cleanCPF = cpf.replace(/\D/g, "");

    // Verifica se tem 11 dígitos
    if (cleanCPF.length !== 11) return false;

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

    // Calcula primeiro dígito verificador
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanCPF[i]) * (10 - i);
    }
    let firstDigit = 11 - (sum % 11);
    firstDigit = firstDigit > 9 ? 0 : firstDigit;

    // Calcula segundo dígito verificador
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleanCPF[i]) * (11 - i);
    }
    let secondDigit = 11 - (sum % 11);
    secondDigit = secondDigit > 9 ? 0 : secondDigit;

    // Compara com os dígitos do CPF
    return (
      firstDigit === parseInt(cleanCPF[9]) &&
      secondDigit === parseInt(cleanCPF[10])
    );
  };

  // Validar CPF em tempo real
  // Atualizar notas quando initialData mudar
  useEffect(() => {
    if (initialData?.id) {
      setNotesText(initialData.notes || "");
    }
  }, [initialData?.id]);

  useEffect(() => {
    if (formData.cpf === "") {
      setCpfValidation(null);
    } else if (formData.cpf.replace(/\D/g, "").length === 11) {
      setCpfValidation(validateCPF(formData.cpf) ? "valid" : "invalid");
    } else {
      setCpfValidation(null);
    }
  }, [formData.cpf]);

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

  // Mutation para atualizar paciente
  const updatePatientMutation = trpc.patients.update.useMutation({
    onSuccess: () => {
      toast.success("Paciente atualizado com sucesso!");
      resetForm();
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao atualizar paciente");
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
    const input = e.target;
    let value = input.value;

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

  // Handler para Backspace/Delete na Data - remove separadores automaticamente
  const handleBirthDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const { selectionStart, selectionEnd, value } = input;
      
      // Se há seleção, deixa o comportamento padrão
      if (selectionStart !== selectionEnd) return;
      
      // Se cursor está no início, não faz nada
      if (selectionStart === 0) return;
      
      e.preventDefault();
      
      // Remove apenas dígitos
      const digitsOnly = value.replace(/\D/g, '');
      
      // Remove o último dígito
      const newDigits = digitsOnly.slice(0, -1);
      
      // Reformata
      let formatted = newDigits;
      if (newDigits.length >= 2) {
        formatted = newDigits.slice(0, 2) + '/' + newDigits.slice(2);
      }
      if (newDigits.length >= 4) {
        formatted = newDigits.slice(0, 2) + '/' + newDigits.slice(2, 4) + '/' + newDigits.slice(4);
      }
      
      setFormData({ ...formData, birthDate: formatted });
    }
  };

  // Formatar CPF enquanto digita - XXX.XXX.XXX-XX
  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    let value = input.value;

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

  // Handler para Backspace/Delete no CPF - remove separadores automaticamente
  const handleCPFKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const { selectionStart, selectionEnd, value } = input;
      
      // Se há seleção, deixa o comportamento padrão
      if (selectionStart !== selectionEnd) return;
      
      // Se cursor está no início, não faz nada
      if (selectionStart === 0) return;
      
      e.preventDefault();
      
      // Remove apenas dígitos
      const digitsOnly = value.replace(/\D/g, '');
      
      // Remove o último dígito
      const newDigits = digitsOnly.slice(0, -1);
      
      // Reformata
      let formatted = newDigits;
      if (newDigits.length >= 3) {
        formatted = newDigits.slice(0, 3) + '.' + newDigits.slice(3);
      }
      if (newDigits.length >= 6) {
        formatted = newDigits.slice(0, 3) + '.' + newDigits.slice(3, 6) + '.' + newDigits.slice(6);
      }
      if (newDigits.length >= 9) {
        formatted = newDigits.slice(0, 3) + '.' + newDigits.slice(3, 6) + '.' + newDigits.slice(6, 9) + '-' + newDigits.slice(9);
      }
      
      setFormData({ ...formData, cpf: formatted });
    }
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 8);
    const formatted = digitsOnly.length > 5
      ? `${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5)}`
      : digitsOnly;
    setFormData({ ...formData, cep: formatted });
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
    setFormData(defaultFormData);
    setAge(null);
    setNotesText("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const requiredFields: Array<[string, string]> = [
      ["code", "Prontuário"],
      ["name", "Nome"],
      ["cpf", "CPF"],
      ["cep", "CEP"],
      ["address", "Endereço"],
      ["city", "Cidade"],
      ["state", "Estado"],
      ["birthDate", "Data de nascimento"],
      ["maritalStatusId", "Estado civil"],
      ["genderId", "Sexo"],
    ];

    const missingFields = requiredFields
      .filter(([field]) => (!isLegacy || field === "name" || field === "code") && !String(formData[field] ?? "").trim())
      .map(([, label]) => label);

    if (missingFields.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${missingFields.join(", ")}.`);
      return;
    }

    const parsedCode = recordNumberSchema.safeParse(formData.code);
    if (!parsedCode.success) { toast.error(parsedCode.error.issues[0].message); return; }

    // Preparar dados para envio
    const submitData = {
      code: parsedCode.data,
      name: formData.name,
      address: formData.address || undefined,
      district: formData.district || undefined,
      cep: formData.cep || undefined,
      phone: formData.phone || undefined,
      mobile: formData.mobile || undefined,
      fax: formData.fax || undefined,
      skinColorId: formData.skinColorId ? parseInt(formData.skinColorId) : undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      rg: formData.rg || undefined,
      cpf: formData.cpf || undefined,
      birthDate: formData.birthDate || undefined,
      birthPlace: formData.birthPlace || undefined,
      motherName: formData.motherName || undefined,
      fatherName: formData.fatherName || undefined,
      responsibleName: formData.responsibleName || undefined,
      responsiblePhone: formData.responsiblePhone || undefined,
      maritalStatusId: Number(formData.maritalStatusId),
      genderId: Number(formData.genderId),
      email: formData.email || undefined,
      referredBy: formData.referredBy || undefined,
      registrationDate: formData.registrationDate || undefined,
      occupation: formData.occupation || undefined,
      additionalInfo1: formData.additionalInfo1 || undefined,
      additionalInfo2: formData.additionalInfo2 || undefined,
      notes: notesText || undefined,
    };

    // Se tem ID, é atualização, senão é criação
    if (initialData?.id) {
      const updateData = Object.fromEntries(
        Object.entries(submitData).map(([key, value]) => [key, value === undefined ? null : value]),
      );
      // Empty lookup options are absent information, never a synthetic ID of zero.
      updateData.maritalStatusId = formData.maritalStatusId ? Number(formData.maritalStatusId) : null;
      updateData.genderId = formData.genderId ? Number(formData.genderId) : null;
      updatePatientMutation.mutate({ id: initialData.id, data: updateData });
    } else {
      createPatientMutation.mutate(submitData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isLegacy && <p className="text-sm text-amber-800 dark:text-amber-200">Cadastro importado: informações ausentes podem ser preenchidas depois.</p>}
      {/* Seção 1: Informações Básicas */}
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">
          {initialData?.id ? "Editar Paciente" : "Informações Básicas"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="patient-record-number">Prontuário *</Label>
            <Input id="patient-record-number" name="code" inputMode="numeric" pattern="[0-9]{1,8}" maxLength={RECORD_NUMBER_MAX_LENGTH}
              value={formData.code} required onChange={event => setFormData({ ...formData, code: event.target.value.replace(/\D/g, "").slice(0, RECORD_NUMBER_MAX_LENGTH) })}
              placeholder="Digite o número do prontuário" aria-describedby="patient-record-number-help" />
            <p id="patient-record-number-help" className="mt-2 text-xs text-muted-foreground">Preenchimento manual. Até 8 dígitos, sem repetir outro paciente.</p>
          </div>
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
            <Label htmlFor="cpf">CPF{isLegacy ? "" : " *"}</Label>
            <div className="flex gap-2 items-end">
              <div className="min-w-0 flex-1">
                <Input
                  id="cpf"
                  name="cpf"
                  value={formData.cpf}
                  onChange={handleCPFChange}
                  onKeyDown={handleCPFKeyDown}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className={cpfValidation === "valid" ? "border-green-500" : cpfValidation === "invalid" ? "border-red-500" : ""}
                />
              </div>
              {cpfValidation === "valid" && (
                <CheckCircle2 className="w-5 h-5 text-green-500 dark:text-green-400 flex-shrink-0" />
              )}
              {cpfValidation === "invalid" && (
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seção 2: Contato */}
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">Contato</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="Telefone"
              type="tel"
              maxLength={40}
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
              type="tel"
              maxLength={40}
            />
          </div>

          <div>
            <Label htmlFor="fax">Fax</Label>
            <Input
              id="fax"
              name="fax"
              value={formData.fax}
              onChange={handleInputChange}
              placeholder="Fax"
              type="tel"
              maxLength={65535}
            />
          </div>

          <div>
            <Label htmlFor="responsibleName">Nome do responsável</Label>
            <Input id="responsibleName" name="responsibleName" value={formData.responsibleName}
              onChange={handleInputChange} placeholder="Nome do responsável" maxLength={200} />
          </div>
          <div>
            <Label htmlFor="responsiblePhone">Telefone do responsável</Label>
            <Input id="responsiblePhone" name="responsiblePhone" value={formData.responsiblePhone}
              onChange={handleInputChange} placeholder="Telefone do responsável" type="tel" maxLength={40} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="address">Endereço{isLegacy ? "" : " *"}</Label>
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
            <Label htmlFor="district">Bairro</Label>
            <Input
              id="district"
              name="district"
              value={formData.district}
              onChange={handleInputChange}
              placeholder="Bairro"
              maxLength={100}
            />
          </div>

          <div>
            <Label htmlFor="cep">CEP{isLegacy ? "" : " *"}</Label>
            <Input
              id="cep"
              name="cep"
              value={formData.cep}
              onChange={handleCepChange}
              placeholder="00000-000"
              inputMode="numeric"
              maxLength={9}
            />
          </div>

          <div>
            <Label htmlFor="city">Cidade{isLegacy ? "" : " *"}</Label>
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
            <Label htmlFor="state">Estado{isLegacy ? "" : " *"}</Label>
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
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">
          Dados Pessoais
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="birthDate">Data de Nascimento{isLegacy ? "" : " *"}</Label>
            <div className="flex gap-2 items-end">
              <div className="min-w-0 flex-1">
                <Input
                  id="birthDate"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleBirthDateChange}
                  onKeyDown={handleBirthDateKeyDown}
                  placeholder="DD/MM/YYYY"
                  maxLength={10}
                />
              </div>
              {age !== null && (
                <div className="text-sm font-semibold text-brand whitespace-nowrap">
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
            <Label htmlFor="motherName">Nome da mãe</Label>
            <Input id="motherName" name="motherName" value={formData.motherName}
              onChange={handleInputChange} placeholder="Nome da mãe" maxLength={200} />
          </div>
          <div>
            <Label htmlFor="fatherName">Nome do pai</Label>
            <Input id="fatherName" name="fatherName" value={formData.fatherName}
              onChange={handleInputChange} placeholder="Nome do pai" maxLength={200} />
          </div>

          <div>
            <Label htmlFor="genderId">Sexo{isLegacy ? "" : " *"}</Label>
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
            <Label htmlFor="maritalStatusId">Estado Civil{isLegacy ? "" : " *"}</Label>
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
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-4">
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
              className="bg-gray-100 dark:bg-muted"
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
      <div className="bg-white dark:bg-card rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">Notas</h3>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowNotesDialog(true)}
          >
            Adicionar Notas
          </Button>
        </div>

        {notesText && (
          <div className="p-4 bg-gray-50 dark:bg-background rounded-lg border border-gray-200 dark:border-border">
            <div className="flex justify-between items-start">
              <p className="min-w-0 flex-1 text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {notesText}
              </p>
              <button
                type="button"
                onClick={() => setNotesText("")}
                aria-label="Remover notas" className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Button
          type="submit"
          className="flex-1 bg-[#087e78] hover:bg-[#06665f]"
          disabled={createPatientMutation.isPending || updatePatientMutation.isPending}
        >
          {createPatientMutation.isPending || updatePatientMutation.isPending
            ? "Salvando..."
            : initialData?.id ? "Atualizar Paciente" : "Cadastrar Paciente"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={resetForm}
          disabled={createPatientMutation.isPending || updatePatientMutation.isPending}
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
            <div className="text-sm text-gray-500 dark:text-slate-400">
              {notesText.length}/2000 caracteres
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowNotesDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => setShowNotesDialog(false)}
                className="bg-[#087e78] hover:bg-[#06665f]"
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

