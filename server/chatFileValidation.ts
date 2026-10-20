import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { CHAT_FILE_TYPES, chatFileError, chatFileExtension, type ChatAttachment } from "../shared/chatAttachments";
const bad=()=>new TRPCError({code:"BAD_REQUEST",message:"Arquivo inválido ou conteúdo incompatível com o formato informado."});
export function decodeChatFile(input:{name:string;base64:string}) {
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64) || input.base64.length%4!==0)throw bad();
  const data=Buffer.from(input.base64,"base64");
  if(data.toString("base64")!==input.base64)throw bad();
  const error=chatFileError({name:input.name,size:data.length});
  if(error)throw new TRPCError({code:"BAD_REQUEST",message:error});
  const name=input.name.normalize("NFKC").replace(/[\\/\u0000-\u001f\u007f]/g,"_").trim();
  if(!name || name.length>180)throw bad();
  const ext=chatFileExtension(name),hex=data.subarray(0,12).toString("hex");
  const compound=["doc","xls","ppt"].includes(ext);
  const zipped=["docx","xlsx","pptx","odt","ods","odp"].includes(ext);
  const valid=ext==="png"?hex.startsWith("89504e470d0a1a0a"):
    ["jpg","jpeg"].includes(ext)?hex.startsWith("ffd8ff"):
    ext==="gif"?["GIF87a","GIF89a"].includes(data.subarray(0,6).toString("ascii")):
    ext==="webp"?data.subarray(0,4).toString("ascii")==="RIFF" && data.subarray(8,12).toString("ascii")==="WEBP":
    ext==="pdf"?data.subarray(0,5).toString("ascii")==="%PDF-":
    compound?hex.startsWith("d0cf11e0a1b11ae1"):
    zipped?hex.startsWith("504b0304"):
    ext==="rtf"?data.subarray(0,5).toString("ascii")==="{\\rtf":
    ["txt","csv"].includes(ext)?!data.includes(0) && Buffer.from(data.toString("utf8"),"utf8").equals(data):false;
  if(!valid)throw bad();
  const meta:ChatAttachment={name,mime:CHAT_FILE_TYPES[ext],size:data.length};
  return {data,meta,hash:createHash("sha256").update(data).digest("hex")};
}
