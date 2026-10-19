import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send, Users, UserRound, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import type { ChatMessage, ChatThread } from "@shared/chatMed";

const countLabel = (count: number) => count > 99 ? "99+" : String(count);
const time = (value: Date) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const date = (value: Date) => new Date(value).toLocaleDateString("pt-BR");
export function mergeChatMessages(...pages: ChatMessage[][]) {
  return Array.from(new Map(pages.flat().map(message => [message.id,message])).values()).sort((a,b) => a.id-b.id);
}

export default function ChatMed({ userId }: { userId: number }) {
  const [open,setOpen] = useState(false);
  const [selected,setSelected] = useState<{ peerId: number | null; name: string } | null>(null);
  const threads = trpc.chatMed.threads.useQuery(undefined, { refetchInterval: open ? 5000 : 20000, retry: 1, refetchIntervalInBackground: false });
  const current = threads.data;
  const conversation = selected && current?.threads.find(thread => thread.peerId === selected.peerId);
  useEffect(() => { if (!open) setSelected(null); }, [open]);
  return <>
    <Button type="button" onClick={() => setOpen(true)} aria-label={`Abrir ChatMed${current?.unread ? `, ${current.unread} mensagens não lidas` : ""}`}
      title="ChatMed" className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 rounded-full bg-[#087e78] p-0 text-white shadow-xl hover:bg-[#06665f]">
      <MessageCircle className="h-6 w-6" />
      {!threads.error && Boolean(current?.unread) && <span className="absolute -right-1 -top-1 flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-background bg-red-600 px-1 text-xs font-bold text-white">{countLabel(current!.unread)}</span>}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="inset-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:inset-auto sm:bottom-4 sm:left-auto sm:right-4 sm:top-auto sm:h-[min(42rem,calc(100dvh-2rem))] sm:w-[26rem] sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b bg-[#087e78]/10 px-4 py-4 pr-12 pt-[max(1rem,env(safe-area-inset-top))] text-left">
          <DialogTitle className="flex items-center gap-2 text-brand"><MessageCircle className="h-5 w-5" />ChatMed</DialogTitle>
          <DialogDescription>Converse com a sua equipe.</DialogDescription>
        </DialogHeader>
        {threads.error ? <div role="alert" className="p-5 text-sm">Não foi possível atualizar o chat. <Button variant="outline" className="mt-3" onClick={() => void threads.refetch()}>Tentar novamente</Button></div> :
          threads.isLoading ? <p className="p-5 text-sm text-muted-foreground">Carregando conversas…</p> :
          !current?.group ? <div className="p-6 text-sm leading-relaxed text-muted-foreground"><p className="mb-2 font-semibold text-foreground">Seu grupo ainda não foi configurado.</p>Peça ao administrador para preencher o campo “Grupo de chat” no seu cadastro de usuário.</div> :
          conversation && current.group ? <ChatConversation key={`${current.group}:${conversation.peerId}`} userId={userId}
            thread={{ group: current.group, peerId: conversation.peerId }} name={conversation.name}
            onBack={() => setSelected(null)} onActivity={() => void threads.refetch()} /> :
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="px-2 pb-3 text-xs text-muted-foreground">Grupo: <span className="font-medium">{current.group}</span></p>
            {current.threads.map(thread => <button type="button" key={thread.peerId ?? "group"} onClick={() => setSelected(thread)}
              className="flex min-h-20 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#087e78]/10 text-brand">{thread.peerId === null ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{thread.peerId === null ? `# ${thread.name}` : thread.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{thread.lastMessage || (thread.peerId === null ? "Canal de todos do grupo" : "Conversa individual")}</span></span>
              <span className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-muted-foreground">{thread.lastAt && time(thread.lastAt)}
                {thread.unread > 0 && <span aria-label={`${thread.unread} não lidas`} className="rounded-full bg-[#087e78] px-2 py-0.5 text-xs font-semibold text-white">{countLabel(thread.unread)}</span>}</span>
            </button>)}
            {current.threads.length === 1 && <p className="px-3 pt-4 text-xs text-muted-foreground">Os colegas aparecerão aqui quando tiverem o mesmo grupo no cadastro.</p>}
          </div>}
      </DialogContent>
    </Dialog>
  </>;
}

function ChatConversation({ userId,thread,name,onBack,onActivity }: {
  userId: number; thread: ChatThread; name: string; onBack: () => void; onActivity: () => void;
}) {
  const utils = trpc.useUtils();
  const [messages,setMessages] = useState<ChatMessage[]>([]);
  const [loading,setLoading] = useState(true);
  const [hasOlder,setHasOlder] = useState(false);
  const [loadingOlder,setLoadingOlder] = useState(false);
  const [error,setError] = useState("");
  const [blocked,setBlocked] = useState(false);
  const [draft,setDraft] = useState("");
  const [refresh,setRefresh] = useState(0);
  const [readRetry,setReadRetry] = useState(0);
  const [atBottom,setAtBottom] = useState(true);
  const alive = useRef(true);
  const latest = useRef(0);
  const readId = useRef(0);
  const attempt = useRef<{ text: string; clientId: string } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  const read = trpc.chatMed.read.useMutation();
  const send = trpc.chatMed.send.useMutation();
  const handleError = (cause: unknown) => {
    const code = (cause as { data?: { code?: string } }).data?.code;
    if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
      setBlocked(true); setMessages([]); onActivity();
    }
    setError(cause instanceof Error ? cause.message : "Não foi possível atualizar. Tente novamente.");
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (document.visibilityState === "hidden") { timer = setTimeout(poll,5000); return; }
      let more = false;
      try {
        const page = await utils.client.chatMed.history.query({ ...thread, ...(latest.current ? { afterId: latest.current } : {}) });
        if (cancelled) return;
        if (!latest.current) setHasOlder(page.hasMore);
        else more = page.hasMore;
        latest.current = Math.max(latest.current,...page.messages.map(message => message.id));
        setMessages(previous => mergeChatMessages(previous,page.messages));
        setBlocked(false); setError(""); setReadRetry(value => value+1);
      } catch (cause) { if (!cancelled) handleError(cause); }
      finally { if (!cancelled) { setLoading(false); timer = setTimeout(poll,more ? 100 : 5000); } }
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [thread.group,thread.peerId,refresh]);

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (restoreScroll.current) {
      node.scrollTop = restoreScroll.current.top + node.scrollHeight - restoreScroll.current.height;
      restoreScroll.current = null;
    } else if (atBottom) node.scrollTop = node.scrollHeight;
  }, [messages]);
  const lastId = messages.filter(message => message.id <= latest.current).at(-1)?.id;
  const displayError = error || send.error?.message;
  useEffect(() => {
    if (blocked || !atBottom || !lastId || lastId <= readId.current || document.visibilityState === "hidden") return;
    const previous = readId.current;
    readId.current = lastId;
    read.mutate({ ...thread,lastSeenId: lastId }, {
      onSuccess: onActivity,
      onError: () => { readId.current = previous; },
    });
  }, [lastId,atBottom,blocked,readRetry]);

  async function older() {
    if (!messages[0] || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await utils.client.chatMed.history.query({ ...thread,beforeId: messages[0].id });
      if (!alive.current) return;
      const node = viewport.current;
      if (node) restoreScroll.current = { height: node.scrollHeight,top: node.scrollTop };
      setAtBottom(false); setHasOlder(page.hasMore);
      setMessages(previous => mergeChatMessages(page.messages,previous));
    } catch (cause) { if (alive.current) handleError(cause); }
    finally { if (alive.current) setLoadingOlder(false); }
  }
  async function submit() {
    const text = draft.trim();
    if (!text || text.length > 4000 || send.isPending || blocked) return;
    if (attempt.current?.text !== text) attempt.current = { text,clientId: crypto.randomUUID() };
    try {
      const sent = await send.mutateAsync({ ...thread,...attempt.current });
      if (!alive.current) return;
      setMessages(previous => mergeChatMessages(previous,[sent]));
      setDraft(""); attempt.current = null; setAtBottom(true); onActivity();
      // Poll from the last confirmed cursor: do not skip concurrent incoming messages.
      setRefresh(value => value+1);
    } catch (cause) { if (alive.current) handleError(cause); }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
      <Button type="button" variant="ghost" size="icon" aria-label="Voltar às conversas" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
      <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{thread.peerId === null ? `# ${name}` : name}</h3><p className="text-xs text-muted-foreground">{thread.peerId === null ? "Todos os membros do grupo" : "Conversa privada entre vocês"}</p></div>
    </div>
    <div ref={viewport} role="log" aria-label="Histórico da conversa" aria-live="polite" onScroll={event => {
      const node = event.currentTarget; setAtBottom(node.scrollHeight-node.scrollTop-node.clientHeight < 64);
    }} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/25 px-4 py-4">
      {hasOlder && !blocked && <div className="text-center"><Button type="button" variant="outline" size="sm" disabled={loadingOlder} onClick={() => void older()}>{loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}</Button></div>}
      {loading && <p className="text-center text-xs text-muted-foreground">Carregando histórico…</p>}
      {!loading && !messages.length && !error && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Comece a conversa!</p>}
      {messages.map((message,index) => <div key={message.id}>
        {(index === 0 || date(messages[index-1].createdAt) !== date(message.createdAt)) && <p className="mb-3 text-center text-[10px] text-muted-foreground">{date(message.createdAt)}</p>}
        <div className={`flex ${message.senderId === userId ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[88%] rounded-2xl px-3 py-2 shadow-sm ${message.senderId === userId ? "rounded-br-sm bg-[#087e78] text-white" : "rounded-bl-sm border bg-background text-foreground"}`}>
            <p className="mb-1 text-xs font-semibold opacity-80">{message.senderId === userId ? "Você" : message.senderName}</p>
            <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message.text}</p>
            <time className="mt-1 block text-right text-[10px] opacity-70" dateTime={new Date(message.createdAt).toISOString()}>{time(message.createdAt)}</time>
          </div>
        </div>
      </div>)}
    </div>
    {!atBottom && messages.length > 0 && !blocked && <Button type="button" variant="outline" size="sm" className="mx-4 my-2 shrink-0 self-center" onClick={() => { if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; setAtBottom(true); }}>Ir para mensagens recentes</Button>}
    {displayError && <div role="alert" className="shrink-0 border-t bg-red-50 px-4 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">{displayError}{" "}
      {!blocked && <button type="button" className="font-semibold underline" onClick={() => { setRefresh(value => value+1); if (send.error) void submit(); }}>Tentar novamente</button>}
      {blocked && <button type="button" className="font-semibold underline" onClick={onBack}>Voltar</button>}
    </div>}
    <form onSubmit={event => { event.preventDefault(); void submit(); }} className="shrink-0 border-t bg-background p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      <label htmlFor="chatmed-message" className="sr-only">Mensagem</label>
      <div className="flex items-end gap-2">
        <Textarea id="chatmed-message" rows={2} maxLength={4000} value={draft} disabled={send.isPending || blocked || loading}
          onChange={event => setDraft(event.target.value)} placeholder="Digite uma mensagem…" className="max-h-32 min-h-12 resize-none"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
        <Button type="submit" size="icon" aria-label="Enviar mensagem" disabled={!draft.trim() || send.isPending || blocked || loading} className="h-12 w-12 shrink-0 bg-[#087e78] text-white hover:bg-[#06665f]">{send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</Button>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>{send.isPending ? "Enviando…" : send.error ? "Mensagem não enviada. Seu texto foi mantido." : "Enter envia · Shift+Enter quebra linha"}</span><span>{draft.length}/4000</span></div>
    </form>
  </div>;
}
