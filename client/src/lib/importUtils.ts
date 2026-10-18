/**
 * Utilitários para importação de dados de CSV e Excel
 */

export interface PatientImportData {
  name?: string;
  code?: string;
  address?: string;
  district?: string;
  cep?: string;
  phone?: string;
  mobile?: string;
  skinColorId?: number;
  city?: string;
  state?: string;
  rg?: string;
  cpf?: string;
  birthDate?: string;
  birthPlace?: string;
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

/**
 * Parse CSV content to array of patient objects
 */
export function parseCSV(csvContent: string): PatientImportData[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('Arquivo CSV vazio ou inválido');
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  const patients: PatientImportData[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    const patient: PatientImportData = {};

    // Map values to patient object based on header
    header.forEach((col, index) => {
      const value = values[index]?.trim() || '';
      const lowerCol = col.toLowerCase().trim();

      if (!value) return; // Skip empty values

      // Map column names to patient properties
      if (lowerCol.includes('nome')) patient.name = value;
      else if (lowerCol.includes('código') || lowerCol.includes('codigo')) patient.code = value;
      else if (lowerCol.includes('endereço') || lowerCol.includes('endereco')) patient.address = value;
      else if (lowerCol === 'bairro' || lowerCol === 'district') patient.district = value;
      else if (lowerCol === 'cep' || lowerCol.includes('cep')) patient.cep = value;
      else if (lowerCol.includes('telefone')) patient.phone = value;
      else if (lowerCol.includes('celular')) patient.mobile = value;
      else if (lowerCol.includes('cor') || lowerCol.includes('pele')) patient.skinColorId = parseInt(value) || undefined;
      else if (lowerCol.includes('cidade')) patient.city = value;
      else if (lowerCol.includes('estado')) patient.state = value;
      else if (lowerCol.includes('rg')) patient.rg = value;
      else if (lowerCol.includes('cpf')) patient.cpf = value;
      else if (lowerCol.includes('nascimento') || lowerCol.includes('data de nascimento')) patient.birthDate = value;
      else if (lowerCol.includes('natural')) patient.birthPlace = value;
      else if (lowerCol.includes('civil') || lowerCol.includes('estado civil')) patient.maritalStatusId = parseInt(value) || undefined;
      else if (lowerCol.includes('sexo') || lowerCol.includes('gênero') || lowerCol.includes('genero')) patient.genderId = parseInt(value) || undefined;
      else if (lowerCol.includes('email') || lowerCol.includes('e-mail')) patient.email = value;
      else if (lowerCol.includes('indicado')) patient.referredBy = value;
      else if (lowerCol.includes('cadastro')) patient.registrationDate = value;
      else if (lowerCol.includes('ocupação') || lowerCol.includes('ocupacao')) patient.occupation = value;
      else if (lowerCol.includes('adicional 1') || lowerCol.includes('info 1')) patient.additionalInfo1 = value;
      else if (lowerCol.includes('adicional 2') || lowerCol.includes('info 2')) patient.additionalInfo2 = value;
      else if (lowerCol.includes('notas')) patient.notes = value;
    });

    // Only add if has name (required field)
    if (patient.name && patient.name.trim()) {
      patients.push(patient as PatientImportData & { name: string });
    }
  }

  return patients;
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);

  return result;
}

/**
 * Parse Excel file to array of patient objects
 */
export async function parseExcel(file: File): Promise<PatientImportData[]> {
  try {
    const XLSX = await import('xlsx');
    
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    
    if (!worksheet) {
      throw new Error('Nenhuma planilha encontrada no arquivo');
    }

    const data = XLSX.utils.sheet_to_json(worksheet);
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Arquivo Excel vazio ou inválido');
    }

    // Convert Excel data to patient objects
    const patients: PatientImportData[] = data.map((row: any) => {
      const patient: PatientImportData = {};

      Object.keys(row).forEach((key) => {
        const value = row[key];
        if (!value) return;

        const lowerKey = key.toLowerCase().trim();

        if (lowerKey.includes('nome')) patient.name = String(value);
        else if (lowerKey.includes('código') || lowerKey.includes('codigo')) patient.code = String(value);
        else if (lowerKey.includes('endereço') || lowerKey.includes('endereco')) patient.address = String(value);
        else if (lowerKey === 'bairro' || lowerKey === 'district') patient.district = String(value);
        else if (lowerKey === 'cep' || lowerKey.includes('cep')) patient.cep = String(value);
        else if (lowerKey.includes('telefone')) patient.phone = String(value);
        else if (lowerKey.includes('celular')) patient.mobile = String(value);
        else if (lowerKey.includes('cor') || lowerKey.includes('pele')) patient.skinColorId = parseInt(String(value)) || undefined;
        else if (lowerKey.includes('cidade')) patient.city = String(value);
        else if (lowerKey.includes('estado')) patient.state = String(value);
        else if (lowerKey.includes('rg')) patient.rg = String(value);
        else if (lowerKey.includes('cpf')) patient.cpf = String(value);
        else if (lowerKey.includes('nascimento') || lowerKey.includes('data de nascimento')) patient.birthDate = String(value);
        else if (lowerKey.includes('natural')) patient.birthPlace = String(value);
        else if (lowerKey.includes('civil') || lowerKey.includes('estado civil')) patient.maritalStatusId = parseInt(String(value)) || undefined;
        else if (lowerKey.includes('sexo') || lowerKey.includes('gênero') || lowerKey.includes('genero')) patient.genderId = parseInt(String(value)) || undefined;
        else if (lowerKey.includes('email') || lowerKey.includes('e-mail')) patient.email = String(value);
        else if (lowerKey.includes('indicado')) patient.referredBy = String(value);
        else if (lowerKey.includes('cadastro')) patient.registrationDate = String(value);
        else if (lowerKey.includes('ocupação') || lowerKey.includes('ocupacao')) patient.occupation = String(value);
        else if (lowerKey.includes('adicional 1') || lowerKey.includes('info 1')) patient.additionalInfo1 = String(value);
        else if (lowerKey.includes('adicional 2') || lowerKey.includes('info 2')) patient.additionalInfo2 = String(value);
        else if (lowerKey.includes('notas')) patient.notes = String(value);
      });

      return patient;
    });

    // Filter out patients without name
    return patients.filter((p): p is PatientImportData & { name: string } => !!p.name);
  } catch (error) {
    throw new Error(`Erro ao processar arquivo Excel: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

