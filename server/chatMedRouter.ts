import { z } from "zod";
import { chatFilePayloadSchema } from "../shared/chatAttachments";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { chatHistorySchema, chatSendSchema, chatThreadSchema } from "../shared/chatMed";
import { getDb } from "./db";
import { ChatMedStore } from "./chatMedStore";

async function store() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ChatMed indisponível. Tente novamente." });
  return new ChatMedStore(db.$client.promise());
}
export const chatMedRouter = router({
  threads: protectedProcedure.query(async ({ ctx }) => (await store()).threads(ctx.user.id)),
  history: protectedProcedure.input(chatHistorySchema).query(async ({ ctx,input }) => (await store()).history(ctx.user.id,input)),
  send: protectedProcedure.input(chatSendSchema).mutation(async ({ ctx,input }) => (await store()).send(ctx.user.id,input)),
  sendFile: protectedProcedure.input(chatThreadSchema.merge(chatFilePayloadSchema)).mutation(async ({ctx,input}) => (await store()).sendFile(ctx.user.id,input)),
  attachment: protectedProcedure.input(chatThreadSchema.extend({messageId:z.number().int().positive()})).query(async ({ctx,input}) => {
    ctx.res.setHeader("Cache-Control","private, no-store");
    return (await store()).attachment(ctx.user.id,input);
  }),
  read: protectedProcedure.input(chatThreadSchema.extend({ lastSeenId: z.number().int().positive() })).mutation(async ({ ctx,input }) => (await store()).read(ctx.user.id,input)),
});
