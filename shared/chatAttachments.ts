import { z } from "zod";

export const CHAT_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_FILE_TYPES: Record<string, string> = {
  png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp",
  pdf:"application/pdf",
  doc:"application/msword", docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:"application/vnd.ms-excel", xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:"application/vnd.ms-powerpoint", pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt:"application/vnd.oasis.opendocument.text", ods:"application/vnd.oasis.opendocument.spreadsheet", odp:"application/vnd.oasis.opendocument.presentation",
  txt:"text/plain", csv:"text/csv", rtf:"application/rtf",
};
export const CHAT_FILE_ACCEPT = Object.keys(CHAT_FILE_TYPES).map(ext => "."+ext).join(",");
export const chatFilePayloadSchema = z.object({
  name:z.string().min(1).max(180),
  base64:z.string().min(4).max(4*Math.ceil(CHAT_FILE_MAX_BYTES/3)),
  text:z.string().trim().max(4000).default(""),
  clientId:z.string().uuid(),
}).strict();
export type ChatAttachment = { name:string; mime:string; size:number };
export function chatFileExtension(name:string) { return name.split(".").pop()?.toLowerCase() || ""; }
export function chatFileError(file:{name:string;size:number}) {
  if(!CHAT_FILE_TYPES[chatFileExtension(file.name)])return "Formato não permitido. Use imagem, PDF ou documento Office.";
  if(file.size<1 || file.size>CHAT_FILE_MAX_BYTES)return "O arquivo deve ter até 5 MB e não pode estar vazio.";
  return null;
}
