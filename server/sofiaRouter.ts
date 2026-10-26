import { TRPCError } from "@trpc/server";
import { protectedProcedure,router } from "./_core/trpc";
import { getDb } from "./db";
import { sofiaAskSchema,sofiaHistorySchema } from "../shared/sofia";
import { SofiaStore } from "./sofiaStore";

async function store(){
  const db=await getDb();
  if(!db)throw new TRPCError({code:"INTERNAL_SERVER_ERROR",message:"SofIA indisponível. Tente novamente."});
  return new SofiaStore(db.$client.promise());
}

export const sofiaRouter=router({
  history:protectedProcedure.input(sofiaHistorySchema).query(async({ctx,input})=>(await store()).history(ctx.user.id,input)),
  ask:protectedProcedure.input(sofiaAskSchema).mutation(async({ctx,input})=>(await store()).askPrivate(ctx.user.id,input)),
});

