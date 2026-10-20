import { TRPCError } from "@trpc/server";
import { decodeChatFile } from "./chatFileValidation";
import type { z } from "zod";
import type { chatFilePayloadSchema } from "../shared/chatAttachments";
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { ChatThread, ChatHistoryInput, ChatSendInput, ChatMessage } from "../shared/chatMed";

type Actor = { id: number; name: string | null; username: string | null; chatGroup: string | null };
type Db = Pick<Pool, "getConnection">;
const forbidden = () => new TRPCError({ code: "FORBIDDEN", message: "Esta conversa não está disponível no seu grupo de chat." });
const message = (row: any): ChatMessage => ({ id: Number(row.id), senderId: Number(row.senderId), senderName: row.senderName, text: row.body, createdAt: row.createdAt, ...(row.fileName ? { attachment: {name:row.fileName,mime:row.mimeType,size:Number(row.byteSize)} } : {}) });

export class ChatMedStore {
  constructor(private pool: Db) {}

  private async run<T>(userId: number, thread: ChatThread | undefined, action: (db: PoolConnection, actor: Actor, peer?: Actor) => Promise<T>): Promise<T> {
    let db: PoolConnection;
    try { db = await this.pool.getConnection(); }
    catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ChatMed indisponível. Tente novamente." }); }
    try {
      await db.beginTransaction();
      // Lock in ID order to serialize membership edits with sends/reads.
      const ids = Array.from(new Set([userId, ...(thread?.peerId ? [thread.peerId] : [])])).sort((a,b) => a-b);
      const [rows] = await db.query<(Actor & RowDataPacket)[]>(
        `SELECT id,name,username,chatGroup FROM users WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id LOCK IN SHARE MODE`, ids);
      const actor = rows.find(row => row.id === userId);
      if (!actor) throw new TRPCError({ code: "UNAUTHORIZED", message: "Entre novamente para usar o ChatMed." });
      const peer = thread?.peerId ? rows.find(row => row.id === thread.peerId) : undefined;
      if (thread && (!actor.chatGroup || actor.chatGroup !== thread.group ||
        (thread.peerId !== null && (!peer || peer.id === userId || peer.chatGroup !== actor.chatGroup)))) throw forbidden();
      const result = await action(db, actor, peer);
      await db.commit();
      return result;
    } catch (error) {
      await db.rollback();
      if (error instanceof TRPCError) throw error;
      console.error("[ChatMed]", (error as { code?: string }).code || "DATABASE_ERROR");
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível acessar o ChatMed. Tente novamente." });
    } finally { db.release(); }
  }

  private async conversation(db: PoolConnection, actor: Actor, peer: Actor | undefined, create = false) {
    const a = peer ? Math.min(actor.id, peer.id) : 0;
    const b = peer ? Math.max(actor.id, peer.id) : 0;
    if (create) await db.query(`INSERT INTO chatmed_conversations (groupName,memberA,memberB) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [actor.chatGroup,a,b]);
    const [rows] = await db.query<RowDataPacket[]>("SELECT id FROM chatmed_conversations WHERE groupName=? AND memberA=? AND memberB=?", [actor.chatGroup,a,b]);
    return rows[0] ? Number(rows[0].id) : null;
  }

  async threads(userId: number) {
    return this.run(userId, undefined, async (db, actor) => {
      if (!actor.chatGroup) return { group: null, threads: [], unread: 0 };
      const [members] = await db.query<RowDataPacket[]>("SELECT id,name,username FROM users WHERE chatGroup=? AND id<>? ORDER BY name,username,id", [actor.chatGroup,userId]);
      const [conversations] = await db.query<RowDataPacket[]>(`SELECT c.id,c.memberA,c.memberB,
        (SELECT COUNT(*) FROM chatmed_messages m WHERE m.conversationId=c.id AND m.senderId<>? AND m.id>COALESCE(r.lastReadId,0)) AS unread,
        (SELECT body FROM chatmed_messages m WHERE m.conversationId=c.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
        (SELECT createdAt FROM chatmed_messages m WHERE m.conversationId=c.id ORDER BY m.id DESC LIMIT 1) AS lastAt
        FROM chatmed_conversations c LEFT JOIN chatmed_reads r ON r.conversationId=c.id AND r.userId=?
        WHERE c.groupName=? AND ((c.memberA=0 AND c.memberB=0) OR c.memberA=? OR c.memberB=?)`, [userId,userId,actor.chatGroup,userId,userId]);
      const entry = (peerId: number | null, name: string) => {
        const c = conversations.find(c => peerId === null ? c.memberA === 0 && c.memberB === 0 :
          c.memberA === Math.min(userId,peerId) && c.memberB === Math.max(userId,peerId));
        return { peerId, name, unread: Number(c?.unread || 0), lastMessage: (c?.lastMessage as string | null) ?? null, lastAt: (c?.lastAt as Date | null) ?? null };
      };
      const threads = [entry(null, actor.chatGroup), ...members.map(member => entry(Number(member.id), member.name || member.username || "Usuário"))];
      return { group: actor.chatGroup, threads, unread: threads.reduce((total,t) => total+t.unread,0) };
    });
  }

  async history(userId: number, input: ChatHistoryInput) {
    return this.run(userId, input, async (db, actor, peer) => {
      const id = await this.conversation(db,actor,peer);
      if (!id) return { messages: [] as ChatMessage[], hasMore: false };
      const incremental = Boolean(input.afterId);
      const size = incremental ? 100 : 50;
      const cursor = input.beforeId ?? input.afterId;
      const [rows] = await db.query<RowDataPacket[]>(`SELECT m.id,m.senderId,m.senderName,m.body,m.createdAt,a.fileName,a.mimeType,a.byteSize FROM chatmed_messages m
        LEFT JOIN chatmed_attachments a ON a.messageId=m.id
        WHERE m.conversationId=? ${cursor ? `AND m.id ${incremental ? ">" : "<"} ?` : ""}
        ORDER BY m.id ${incremental ? "ASC" : "DESC"} LIMIT ?`, [id,...(cursor ? [cursor] : []),size+1]);
      const hasMore = rows.length > size;
      const page = rows.slice(0,size);
      if (!incremental) page.reverse();
      return { messages: page.map(message), hasMore };
    });
  }

  async send(userId: number, input: ChatSendInput) {
    return this.run(userId,input,async (db,actor,peer) => {
      const id = await this.conversation(db,actor,peer,true);
      await db.query<ResultSetHeader>(`INSERT INTO chatmed_messages (conversationId,senderId,senderName,body,clientId)
        VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [id,userId,(actor.name || actor.username || "Usuário").slice(0,200),input.text,input.clientId]);
      const [rows] = await db.query<RowDataPacket[]>("SELECT id,conversationId,senderId,senderName,body,createdAt FROM chatmed_messages WHERE senderId=? AND clientId=? FOR UPDATE", [userId,input.clientId]);
      if (Number(rows[0].conversationId) !== id || rows[0].body !== input.text) throw new TRPCError({ code: "CONFLICT", message: "Reenvio inválido. Atualize a conversa e tente novamente." });
      return message(rows[0]);
    });
  }


  async sendFile(userId:number, input:ChatThread & z.infer<typeof chatFilePayloadSchema>) {
    const file=decodeChatFile(input);
    const body=input.text.trim() || "📎 "+file.meta.name;
    return this.run(userId,input,async(db,actor,peer)=>{
      const id=await this.conversation(db,actor,peer,true);
      const [inserted]=await db.query<ResultSetHeader>(`INSERT IGNORE INTO chatmed_messages(conversationId,senderId,senderName,body,clientId)
        VALUES(?,?,?,?,?)`,[id,userId,(actor.name || actor.username || "Usuário").slice(0,200),body,input.clientId]);
      const [rows]=await db.query<RowDataPacket[]>("SELECT id,conversationId,senderId,senderName,body,createdAt FROM chatmed_messages WHERE senderId=? AND clientId=? FOR UPDATE",[userId,input.clientId]);
      const row=rows[0];
      if(!row || Number(row.conversationId)!==id || row.body!==body)throw new TRPCError({code:"CONFLICT",message:"Reenvio de arquivo inválido. Tente novamente."});
      if(inserted.affectedRows===1) {
        await db.query("INSERT INTO chatmed_attachments(messageId,fileName,mimeType,byteSize,fileHash,fileData) VALUES(?,?,?,?,?,?)",[row.id,file.meta.name,file.meta.mime,file.meta.size,file.hash,file.data]);
      } else {
        const [old]=await db.query<RowDataPacket[]>("SELECT fileName,fileHash FROM chatmed_attachments WHERE messageId=?",[row.id]);
        if(!old[0] || old[0].fileName!==file.meta.name || old[0].fileHash!==file.hash)throw new TRPCError({code:"CONFLICT",message:"Reenvio de arquivo inválido. Tente novamente."});
      }
      return message({...row,fileName:file.meta.name,mimeType:file.meta.mime,byteSize:file.meta.size});
    });
  }

  async attachment(userId:number,input:ChatThread & {messageId:number}) {
    return this.run(userId,input,async(db,actor,peer)=>{
      const id=await this.conversation(db,actor,peer);
      if(!id)throw forbidden();
      const [rows]=await db.query<RowDataPacket[]>(`SELECT a.fileName,a.mimeType,a.byteSize,a.fileData FROM chatmed_attachments a
        JOIN chatmed_messages m ON m.id=a.messageId WHERE m.conversationId=? AND m.id=?`,[id,input.messageId]);
      if(!rows[0])throw forbidden();
      const row=rows[0];
      return {name:row.fileName as string,mime:row.mimeType as string,size:Number(row.byteSize),base64:(row.fileData as Buffer).toString("base64")};
    });
  }

  async read(userId: number, input: ChatThread & { lastSeenId: number }) {
    return this.run(userId,input,async (db,actor,peer) => {
      const id = await this.conversation(db,actor,peer);
      if (!id) throw forbidden();
      const [rows] = await db.query<RowDataPacket[]>("SELECT id FROM chatmed_messages WHERE conversationId=? AND id=?", [id,input.lastSeenId]);
      if (!rows.length) throw forbidden();
      await db.query(`INSERT INTO chatmed_reads (conversationId,userId,lastReadId) VALUES (?,?,?)
        ON DUPLICATE KEY UPDATE lastReadId=GREATEST(lastReadId,VALUES(lastReadId))`, [id,userId,input.lastSeenId]);
      return { success: true };
    });
  }
}
