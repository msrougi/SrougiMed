import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { sourceFiles, chunkSize } from "../../../shared/personalmedUpload";
export default function MigrationUpload(){
 const [status,setStatus]=useState("");const [busy,setBusy]=useState(false);
 const put=trpc.migrationUpload.put.useMutation();const finish=trpc.migrationUpload.finish.useMutation();
 async function upload(key:keyof typeof sourceFiles,file:File){setBusy(true);
 try{if(file.size!==sourceFiles[key].bytes)throw new Error("Selecione o arquivo original autorizado.");
 for(let part=0;part*chunkSize<file.size;part++){
 const blob=file.slice(part*chunkSize,(part+1)*chunkSize);
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.readAsDataURL(blob);});
 await put.mutateAsync({key,part,data});setStatus(`${key}: ${Math.min(100,Math.round((part+1)*chunkSize/file.size*100))}%`);
 }
 await finish.mutateAsync({key});setStatus(`${key}: arquivo recebido e conferido. Nenhum cadastro importado nesta etapa.`);
 }catch(e){setStatus(e instanceof Error?e.message:"Falha no envio. Tente novamente para retomar.");}finally{setBusy(false);}}
 return <details className="mt-8 rounded border p-4"><summary>Preparar migração PersonalMed</summary>
 <p className="my-3">Envie os arquivos de origem autorizados para conferência. A importação e a limpeza dos testes serão executadas em etapa separada.</p>
 {(["backup","patients"] as const).map(key=><label className="block my-3" key={key}>{key==="backup"?"Backup original (.zip)":"Pacientes extraídos (.jsonl.gz)"}<input aria-label={key==="backup"?"Backup original":"Pacientes extraídos"} className="block" type="file" disabled={busy} onChange={e=>{if(e.target.files?.[0])void upload(key,e.target.files[0]);}}/></label>)}<p role="status">{status}</p></details>;
}
