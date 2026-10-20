import { TRPCError } from "@trpc/server";
import { chatMentionListSchema, mentionBoundary, type ChatMentionInput, type ChatMention } from "../shared/chatMentions";
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


  private async mentions(db:PoolConnection,actor:Actor,thread:ChatThread,text:string,input:ChatMentionInput[]|undefined) {
    const spans=chatMentionListSchema.parse(input || []).slice().sort((a,b)=>a.start-b.start);
    if(!spans.length)return [] as ChatMention[];
    if(thread.peerId!==null)throw new TRPCError({code:"BAD_REQUEST",message:"Use menções no canal do grupo."});
    const ids=Array.from(new Set(spans.map(span=>span.userId))).sort((a,b)=>a-b);
    const [members]=await db.query<(Actor & RowDataPacket)[]>(`SELECT id,name,username,chatGroup FROM users WHERE id IN (${ids.map(()=>"?").join(",")}) ORDER BY id LOCK IN SHARE MODE`,ids);
    let previousEnd=0;
    return spans.map(span=>{
      const member=members.find(user=>user.id===span.userId);
      if(!member || member.chatGroup!==actor.chatGroup)throw forbidden();
      const name=(member.name || member.username || "Usuário").slice(0,200);
      if(span.start<previousEnd || span.end>text.length || text.slice(span.start,span.end)!=="@"+name || !mentionBoundary(text,span.start,span.end))throw new TRPCError({code:"BAD_REQUEST",message:"Menção alterada. Escolha a pessoa novamente na lista."});
      previousEnd=span.end;return {...span,name};
    });
  }

  private async messageMentions(db:PoolConnection,messageId:number):Promise<ChatMention[]> {
    const [rows]=await db.query<RowDataPacket[]>("SELECT userId,startPos,endPos,displayName FROM chatmed_mentions WHERE messageId=? ORDER BY startPos",[messageId]);
    return rows.map(row=>({userId:Number(row.userId),start:Number(row.startPos),end:Number(row.endPos),name:row.displayName as string}));
  }

  private async saveMentions(db:PoolConnection,messageId:number,spans:ChatMention[],created:boolean) {
    if(created && spans.length) {
      await db.query(`INSERT INTO chatmed_mentions(messageId,userId,startPos,endPos,displayName) VALUES ${spans.map(()=>"(?,?,?,?,?)").join(",")}`,spans.flatMap(span=>[messageId,span.userId,span.start,span.end,span.name]));
    }
    const stored=await this.messageMentions(db,messageId);
    const ids=(items:ChatMention[])=>JSON.stringify(items.map(({userId,start,end})=>({userId,start,end})));
    if(ids(stored)!==ids(spans))throw new TRPCError({code:"CONFLICT",message:"Reenvio com menções diferentes. Atualize a conversa e tente novamente."});
    return stored;
  }

  async threads(userId: number) {
    return this.run(userId, undefined, async (db, actor) => {
      if (!actor.chatGroup) return { group: null, threads: [], unread: 0, members: [], mentionUnread: 0 };
      const [members] = await db.query<RowDataPacket[]>("SELECT id,name,username FROM users WHERE chatGroup=? AND id<>? ORDER BY name,username,id", [actor.chatGroup,userId]);
      const [conversations] = await db.query<RowDataPacket[]>(`SELECT c.id,c.memberA,c.memberB,
        (SELECT COUNT(*) FROM chatmed_messages m WHERE m.conversationId=c.id AND m.senderId<>? AND m.id>COALESCE(r.lastReadId,0)) AS unread,
        (SELECT COUNT(DISTINCT m.id) FROM chatmed_mentions x JOIN chatmed_messages m ON m.id=x.messageId
          WHERE m.conversationId=c.id AND x.userId=? AND m.senderId<>? AND m.id>COALESCE(r.lastReadId,0)) AS mentions,
        (SELECT body FROM chatmed_messages m WHERE m.conversationId=c.id ORDER BY m.id DESC LIMIT 1) AS lastMessage,
        (SELECT createdAt FROM chatmed_messages m WHERE m.conversationId=c.id ORDER BY m.id DESC LIMIT 1) AS lastAt
        FROM chatmed_conversations c LEFT JOIN chatmed_reads r ON r.conversationId=c.id AND r.userId=?
        WHERE c.groupName=? AND ((c.memberA=0 AND c.memberB=0) OR c.memberA=? OR c.memberB=?)`, [userId,userId,userId,userId,actor.chatGroup,userId,userId]);
      const entry = (peerId: number | null, name: string) => {
        const c = conversations.find(c => peerId === null ? c.memberA === 0 && c.memberB === 0 :
          c.memberA === Math.min(userId,peerId) && c.memberB === Math.max(userId,peerId));
        return { peerId, name, mentions: Number(c?.mentions || 0), unread: Number(c?.unread || 0), lastMessage: (c?.lastMessage as string | null) ?? null, lastAt: (c?.lastAt as Date | null) ?? null };
      };
      const threads = [entry(null, actor.chatGroup), ...members.map(member => entry(Number(member.id), member.name || member.username || "Usuário"))];
      return { group: actor.chatGroup, threads, unread: threads.reduce((total,t) => total+t.unread,0),
        mentionUnread:threads.reduce((total,t)=>total+t.mentions,0),
        members:[actor,...members].map(member=>({id:Number(member.id),name:String(member.name || member.username || "Usuário").slice(0,200),username:member.username as string|null})) };
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
      const ids=page.map(row=>Number(row.id));
      const [mentions]=ids.length?await db.query<RowDataPacket[]>(`SELECT messageId,userId,startPos,endPos,displayName FROM chatmed_mentions WHERE messageId IN (${ids.map(()=>"?").join(",")}) ORDER BY startPos`,ids):[[] as RowDataPacket[]];
      return { messages:page.map(row=>{
        const spans=mentions.filter(span=>Number(span.messageId)===Number(row.id)).map(span=>({userId:Number(span.userId),start:Number(span.startPos),end:Number(span.endPos),name:span.displayName as string}));
        return {...message(row),...(spans.length?{mentions:spans}:{})};
      }),hasMore };
    });
  }

  async send(userId: number, input: ChatSendInput) {
    return this.run(userId,input,async (db,actor,peer) => {
      const spans=await this.mentions(db,actor,input,input.text,input.mentions);
      const id = await this.conversation(db,actor,peer,true);
      const [inserted]=await db.query<ResultSetHeader>(`INSERT IGNORE INTO chatmed_messages (conversationId,senderId,senderName,body,clientId)
        VALUES (?,?,?,?,?)`, [id,userId,(actor.name || actor.username || "Usuário").slice(0,200),input.text,input.clientId]);
      const [rows] = await db.query<RowDataPacket[]>("SELECT id,conversationId,senderId,senderName,body,createdAt FROM chatmed_messages WHERE senderId=? AND clientId=? FOR UPDATE", [userId,input.clientId]);
      if (Number(rows[0].conversationId) !== id || rows[0].body !== input.text) throw new TRPCError({ code: "CONFLICT", message: "Reenvio inválido. Atualize a conversa e tente novamente." });
      const mentions=await this.saveMentions(db,Number(rows[0].id),spans,inserted.affectedRows===1);
      return {...message(rows[0]),...(mentions.length?{mentions}:{})};
    });
  }


  async sendFile(userId:number, input:ChatThread & z.infer<typeof chatFilePayloadSchema>) {
    const file=decodeChatFile(input);
    const body=input.text.trim() || "📎 "+file.meta.name;
    return this.run(userId,input,async(db,actor,peer)=>{
      const spans=await this.mentions(db,actor,input,body,input.mentions);
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
      const mentions=await this.saveMentions(db,Number(row.id),spans,inserted.affectedRows===1);
      return {...message({...row,fileName:file.meta.name,mimeType:file.meta.mime,byteSize:file.meta.size}),...(mentions.length?{mentions}:{})};
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
