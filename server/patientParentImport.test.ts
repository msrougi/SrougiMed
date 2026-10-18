import { describe, expect, it } from "vitest";
import { parseCSV, parseExcel } from "../client/src/lib/importUtils";
import * as XLSX from "xlsx";

describe("Cabeçalhos de filiação e responsável mantêm nome e telefone do paciente separados", () => {
  const expected = [{ name: "Paciente sintético", motherName: "Mãe sintética", fatherName: "Pai sintético", responsibleName: "Responsável sintético", responsiblePhone: "11 3333-3333", phone: "11 2222-2222" }];
  it("mantém os nomes e telefones separados no CSV", () => {
    expect(parseCSV("Nome,Nome da mãe,Nome do pai,Nome do responsável,Telefone do responsável,Telefone\nPaciente sintético,Mãe sintética,Pai sintético,Responsável sintético,11 3333-3333,11 2222-2222")).toEqual(expected);
  });
  it("mantém os nomes e telefones separados no Excel", async () => {
    const sheet = XLSX.utils.json_to_sheet([{ Nome: "Paciente sintético", "Nome da mãe": "Mãe sintética", "Nome do pai": "Pai sintético", "Nome do responsável": "Responsável sintético", "Telefone do responsável": "11 3333-3333", Telefone: "11 2222-2222" }]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Pacientes");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
    const file = { arrayBuffer: async () => bytes } as File;
    await expect(parseExcel(file)).resolves.toEqual(expected);
  });
});
