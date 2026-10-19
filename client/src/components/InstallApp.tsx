import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { appInstall, installationPlatform } from "@/lib/appInstall";

const seenThisSession = new Set<string>();

export default function InstallApp({ userId, compact = false }: { userId: number; compact?: boolean }) {
  const state = useSyncExternalStore(appInstall!.subscribe, appInstall!.getSnapshot);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const platform = installationPlatform(navigator.userAgent, navigator.maxTouchPoints);

  useEffect(() => {
    if (state.installed) { setOpen(false); return; }
    const key = `srougimed:install-invitation:v1:${userId}`;
    if (seenThisSession.has(key)) return;
    seenThisSession.add(key);
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "seen");
    } catch { /* Private browsers can block storage; remember for this session. */ }
    setOpen(true);
  }, [userId, state.installed]);

  if (state.installed) return null;

  const install = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await appInstall!.install();
      if (result) setOpen(false);
    } catch {
      setError("Não foi possível abrir a instalação. Use as orientações abaixo ou tente novamente pelo menu do navegador.");
    } finally { setBusy(false); }
  };

  return <>
    <Button type="button" variant="outline" aria-label="Instalar aplicativo" title="Instalar aplicativo"
      className={cn("bg-white dark:bg-card text-brand hover:bg-gray-100 dark:hover:bg-muted", compact && "h-11 w-11 rounded-2xl border-white/15 bg-white/10 p-0 text-white shadow-none hover:bg-white/20 hover:text-white lg:w-auto lg:rounded-xl lg:px-3")}
      onClick={() => { setError(""); setOpen(true); }}>
      <Download className={cn("h-4 w-4", !compact && "mr-2")} /><span className={compact ? "sr-only lg:not-sr-only" : undefined}>Instalar aplicativo</span>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <img src="/icons/app-192.png" alt="" className="w-20 h-20 rounded-2xl mx-auto mb-2" />
          <DialogTitle>Instalar o SrougiMed?</DialogTitle>
          <DialogDescription>Adicione o ícone ao seu aparelho para abrir o sistema com mais facilidade. Você pode continuar usando pelo navegador.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        {!state.prompt && <div className="rounded-lg bg-slate-50 dark:bg-background p-4 text-sm space-y-3">
          {platform === "ios" ? <>
            <p className="font-medium">No iPhone ou iPad</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Abra este site no Safari.</li>
              <li>Toque em <Share className="inline w-4 h-4" aria-hidden="true" /> <strong>Compartilhar</strong> no menu do navegador.</li>
              <li>Escolha <PlusSquare className="inline w-4 h-4" aria-hidden="true" /> <strong>Adicionar à Tela de Início</strong>.</li>
              <li>Se aparecer, ative <strong>Abrir como App da Web</strong> e toque em <strong>Adicionar</strong>.</li>
            </ol>
          </> : platform === "mac" ? <>
            <p className="font-medium">No Mac</p>
            <p>No Safari do macOS Sonoma 14 ou mais recente, escolha <strong>Arquivo → Adicionar ao Dock</strong>.</p>
            <p>Em outras versões do macOS, use Chrome ou Edge e procure <strong>Instalar SrougiMed</strong> no menu ou na barra de endereço.</p>
          </> : <>
            <p className="font-medium">{platform === "android" ? "No Android" : "No computador"}</p>
            <p>Abra o menu do Chrome ou Edge e procure <strong>Instalar aplicativo</strong>{platform === "android" ? " ou Adicionar à tela inicial" : " ou o ícone de instalação na barra de endereço"}.</p>
            <p>Se a opção não aparecer, abra este site diretamente no Chrome ou Edge atualizado.</p>
          </>}
        </div>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Agora não</Button>
          {state.prompt ? <Button onClick={install} disabled={busy}><Download className="w-4 h-4 mr-2" />{busy ? "Abrindo…" : "Instalar"}</Button> : <Button onClick={() => setOpen(false)}>Entendi</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
