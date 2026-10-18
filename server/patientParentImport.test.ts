import { describe, expect, it } from "vitest";
import { parseCSV, parseExcel } from "../client/src/lib/importUtils";
import * as XLSX from "xlsx";

describe("Cabeçalhos de filiação não substituem o nome do paciente", () => {
  const expected = [{ name: "Paciente sintético", motherName: "Mãe sintética", fatherName: "Pai sintético" }];
  it("mantém os três nomes separados no CSV", () => {
    expect(parseCSV("Nome,Nome da mãe,Nome do pai\nPaciente sintético,Mãe sintética,Pai sintético")).toEqual(expected);
  });
  it("mantém os três nomes separados no Excel", async () => {
    const sheet = XLSX.utils.json_to_sheet([{ Nome: "Paciente sintético", "Nome da mãe": "Mãe sintética", "Nome do pai": "Pai sintético" }]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Pacientes");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
    const file = { arrayBuffer: async () => bytes } as File;
    await expect(parseExcel(file)).resolves.toEqual(expected);
  });
});
