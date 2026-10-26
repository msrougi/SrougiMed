/**
 * Utilitários para exportação de dados para CSV e Excel
 */

export interface PatientData {
  id: number;
  name: string;
  code?: string | null;
  address?: string | null;
  district?: string | null;
  cep?: string | null;
  phone?: string | null;
  mobile?: string | null;
  fax?: string | null;
  skinColorId?: number | null;
  city?: string | null;
  state?: string | null;
  rg?: string | null;
  cpf?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  maritalStatusId?: number | null;
  genderId?: number | null;
  email?: string | null;
  referredBy?: string | null;
  registrationDate?: string | null;
  occupation?: string | null;
  additionalInfo1?: string | null;
  additionalInfo2?: string | null;
  notes?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * Converte array de pacientes para CSV
 */
export function patientsToCSV(patients: PatientData[]): string {
  if (patients.length === 0) {
    return "";
  }

  // Headers
  const headers = [
    "ID",
    "Nome",
    "Prontuário",
    "Endereço",
    "CEP",
    "Telefone",
    "Celular",
    "Fax",
    "Cor da Pele",
    "Cidade",
    "Estado",
    "RG",
    "CPF",
    "Data de Nascimento",
    "Natural de",
    "Estado Civil",
    "Sexo",
    "E-mail",
    "Indicado Por",
    "Data de Cadastro",
    "Ocupação",
    "Info Adicional 1",
    "Info Adicional 2",
    "Notas",
    "Criado em",
    "Atualizado em",
  ];

  // Converter dados para linhas CSV
  const rows = patients.map((patient) => [
    patient.id,
    escapeCSV(patient.name),
    patient.code || "",
    escapeCSV(patient.address || ""),
    patient.cep || "",
    patient.phone || "",
    patient.mobile || "",
    escapeCSV(patient.fax || ""),
    patient.skinColorId || "",
    escapeCSV(patient.city || ""),
    escapeCSV(patient.state || ""),
    escapeCSV(patient.rg || ""),
    escapeCSV(patient.cpf || ""),
    patient.birthDate || "",
    escapeCSV(patient.birthPlace || ""),
    patient.maritalStatusId || "",
    patient.genderId || "",
    escapeCSV(patient.email || ""),
    escapeCSV(patient.referredBy || ""),
    patient.registrationDate || "",
    escapeCSV(patient.occupation || ""),
    escapeCSV(patient.additionalInfo1 || ""),
    escapeCSV(patient.additionalInfo2 || ""),
    escapeCSV(patient.notes || ""),
    patient.createdAt
      ? new Date(patient.createdAt).toLocaleString("pt-BR")
      : "",
    patient.updatedAt
      ? new Date(patient.updatedAt).toLocaleString("pt-BR")
      : "",
  ]);

  // Combinar headers e rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  return csvContent;
}

/**
 * Escapa valores CSV para evitar problemas com vírgulas e aspas
 */
function escapeCSV(value: string): string {
  if (!value) return "";

  // Se contém vírgula, aspas ou quebra de linha, envolver em aspas
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Baixa arquivo CSV
 */
export function downloadCSV(csvContent: string, filename: string = "pacientes.csv"): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Converte array de pacientes para Excel (formato XLSX usando SheetJS)
 * Nota: Requer instalação de 'xlsx' package
 */
export async function patientsToExcel(
  patients: PatientData[],
  filename: string = "pacientes.xlsx"
): Promise<void> {
  try {
    // Importar dinamicamente para não aumentar bundle size
    const XLSX = await import("xlsx");

    if (patients.length === 0) {
      console.warn("Nenhum paciente para exportar");
      return;
    }

    // Preparar dados
    const data = patients.map((patient) => ({
      ID: patient.id,
      Nome: patient.name,
      Prontuário: patient.code || "",
      Endereço: patient.address || "",
      CEP: patient.cep || "",
      Telefone: patient.phone || "",
      Celular: patient.mobile || "",
      Fax: patient.fax || "",
      "Cor da Pele": patient.skinColorId || "",
      Cidade: patient.city || "",
      Estado: patient.state || "",
      RG: patient.rg || "",
      CPF: patient.cpf || "",
      "Data de Nascimento": patient.birthDate || "",
      "Natural de": patient.birthPlace || "",
      "Estado Civil": patient.maritalStatusId || "",
      Sexo: patient.genderId || "",
      "E-mail": patient.email || "",
      "Indicado Por": patient.referredBy || "",
      "Data de Cadastro": patient.registrationDate || "",
      Ocupação: patient.occupation || "",
      "Info Adicional 1": patient.additionalInfo1 || "",
      "Info Adicional 2": patient.additionalInfo2 || "",
      Notas: patient.notes || "",
      "Criado em": patient.createdAt
        ? new Date(patient.createdAt).toLocaleString("pt-BR")
        : "",
      "Atualizado em": patient.updatedAt
        ? new Date(patient.updatedAt).toLocaleString("pt-BR")
        : "",
    }));

    // Criar workbook
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pacientes");

    // Ajustar largura das colunas
    const maxWidth = 20;
    const colWidths = Object.keys(data[0] || {}).map(() => ({
      wch: maxWidth,
    }));
    worksheet["!cols"] = colWidths;

    // Baixar arquivo
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error("Erro ao exportar para Excel:", error);
    throw new Error("Não foi possível exportar para Excel. Certifique-se de que o pacote 'xlsx' está instalado.");
  }
}

