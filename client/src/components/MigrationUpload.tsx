import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { sourceFiles, chunkSize } from "../../../shared/personalmedUpload";

type SourceKey = keyof typeof sourceFiles;
const keys: SourceKey[] = ["backup_updated", "backup", "patients"];
const labels = {
  backup: "Backup anterior (.zip)",
  patients: "Pacientes extraídos do backup anterior (.jsonl.gz)",
  backup_updated: "Backup atualizado (.zip)",
};
const size = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB`;

export default function MigrationUpload() {
  const [selected, setSelected] = useState<Partial<Record<SourceKey, File>>>({});
  const [status, setStatus] = useState<Partial<Record<SourceKey, string>>>({});
  const [error, setError] = useState<Partial<Record<SourceKey, string>>>({});
  const [progress, setProgress] = useState<Partial<Record<SourceKey, number>>>({});
  const [busy, setBusy] = useState<SourceKey | null>(null);
  const sending = useRef(false);
  const receipt = trpc.migrationUpload.status.useQuery(undefined, { retry: false, refetchInterval: busy ? 5000 : false });
  const put = trpc.migrationUpload.put.useMutation();
  const finish = trpc.migrationUpload.finish.useMutation();

  function choose(key: SourceKey, file: File | undefined) {
    if (!file) return;
    setSelected(previous => ({ ...previous, [key]: file }));
    setProgress(previous => ({ ...previous, [key]: 0 }));
    setStatus(previous => ({ ...previous, [key]: `Selecionado: ${file.name} (${size(file.size)}). Clique em Enviar arquivo.` }));
    setError(previous => ({ ...previous, [key]: file.size === sourceFiles[key].bytes ? "" :
      `O arquivo tem ${size(file.size)}. Este campo espera ${size(sourceFiles[key].bytes)}. Selecione o ZIP disponibilizado na conversa, sem descompactar.` }));
  }

  async function upload(key: SourceKey) {
    const file = selected[key];
    if (!file || sending.current || file.size !== sourceFiles[key].bytes) return;
    sending.current = true;
    setBusy(key);
    setError(previous => ({ ...previous, [key]: "" }));
    setStatus(previous => ({ ...previous, [key]: "Conferindo o arquivo selecionado…" }));
    try {
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const digest = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
      if (digest !== sourceFiles[key].sha256) throw new Error("O conteúdo não corresponde ao arquivo autorizado. Baixe novamente o ZIP disponibilizado na conversa, sem descompactar.");
      const parts = Math.ceil(file.size / chunkSize);
      for (let part = 0; part < parts; part++) {
        setStatus(previous => ({ ...previous, [key]: `Enviando parte ${part + 1} de ${parts}… Aguarde a resposta do servidor.` }));
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado. Selecione-o novamente."));
          reader.onabort = () => reject(new Error("A leitura do arquivo foi interrompida."));
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.readAsDataURL(file.slice(part * chunkSize, (part + 1) * chunkSize));
        });
        await put.mutateAsync({ key, part, data });
        setProgress(previous => ({ ...previous, [key]: Math.min(100, Math.floor((part + 1) / parts * 100)) }));
      }
      setStatus(previous => ({ ...previous, [key]: "Arquivo enviado. Aguardando conferência final no servidor…" }));
      await finish.mutateAsync({ key });
      setStatus(previous => ({ ...previous, [key]: "Arquivo recebido e conferido. Nenhum cadastro importado nesta etapa." }));
      await receipt.refetch();
    } catch (e) {
      setStatus(previous => ({ ...previous, [key]: "Envio não concluído." }));
      setError(previous => ({ ...previous, [key]: `${e instanceof Error ? e.message : "Falha no envio."} Você pode clicar em Enviar arquivo novamente; as partes já recebidas serão conferidas sem duplicar.` }));
      void receipt.refetch();
    } finally {
      sending.current = false;
      setBusy(null);
    }
  }

  return <details className="mt-8 rounded border p-4">
    <summary>Preparar migração PersonalMed</summary>
    <p className="my-3">Selecione o arquivo e clique em Enviar arquivo. Esta etapa apenas recebe e confere a origem; não importa nem apaga cadastros.</p>
    <button type="button" className="mb-3 underline" disabled={!!busy || receipt.isFetching} onClick={() => void receipt.refetch()}>Conferir arquivos recebidos</button>
    {receipt.error && <p role="alert" className="text-red-700">Não foi possível consultar os arquivos recebidos. {receipt.error.message}</p>}
    {keys.map(key => {
      const received = receipt.data?.find(item => item.key === key);
      return <section key={key} className="my-4 rounded border p-3">
        <label htmlFor={`migration-${key}`} className="block font-semibold">{labels[key]}</label>
        <p className="text-sm">Tamanho esperado: {size(sourceFiles[key].bytes)}.</p>
        <input id={`migration-${key}`} aria-label={labels[key]} className="my-2 block" type="file" accept={key === "patients" ? ".gz" : ".zip"} disabled={!!busy}
          onChange={event => { choose(key, event.target.files?.[0]); event.target.value = ""; }} />
        {selected[key] && <p className="break-all">{selected[key]!.name} — {size(selected[key]!.size)}</p>}
        <button type="button" className="my-2 rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50" disabled={!!busy || !selected[key] || selected[key]!.size !== sourceFiles[key].bytes} onClick={() => void upload(key)}>
          {busy === key ? "Enviando…" : "Enviar arquivo"}
        </button>
        {progress[key] !== undefined && <div><progress className="w-full" max={100} value={progress[key]} aria-label={`Progresso: ${labels[key]}`} /><span>{progress[key]}%</span></div>}
        <p role="status" aria-live="polite">{status[key]}</p>
        {error[key] && <p role="alert" className="my-2 break-words text-red-700">{error[key]}</p>}
        {received && <p className="mt-2 text-sm">Servidor: {received.verified ? "arquivo recebido e conferido" : received.bytes > 0 ? `${size(received.bytes)} recebidos; envio ainda incompleto` : "nenhuma parte recebida"}.</p>}
      </section>;
    })}
  </details>;
}
