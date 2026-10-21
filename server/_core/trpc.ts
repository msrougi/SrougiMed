import {accessLoginFlowEnabled,assertSelectiveSession} from "../cloudflareLoginFlow";
import {cloudflareAccessEnabled,requestAccessIdentity,assertAccessAccount,assertAccessSession} from "../cloudflareAccess";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertDeviceAccess } from "../deviceAccess";
import {assertSecondFactorAccess} from "../trustedDevices";
import { assertNetworkAccess } from "../networkAccess";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
const deviceProcedure = t.procedure.use(async ({ ctx, path, next }) => {
  if(accessLoginFlowEnabled()){
    if(ctx.user && !["auth.logout","customAuth.login","customAuth.verifyLoginCode"].includes(path))await assertSelectiveSession(ctx.user,ctx.req);
  } else if(cloudflareAccessEnabled()){
    const identity=await requestAccessIdentity(ctx.req);
    if(ctx.user && !["auth.logout","customAuth.login","customAuth.verifyLoginCode"].includes(path)){
      await assertAccessAccount(ctx.user,identity);
      assertAccessSession(ctx.user,ctx.req,identity);
    }
  }
  // Logout and switching accounts must remain possible from a blocked session.
  if (ctx.user && !["auth.logout","customAuth.login","customAuth.verifyLoginCode"].includes(path)) {
    assertDeviceAccess(ctx.user, ctx.req.headers ?? {});
    if(!cloudflareAccessEnabled()){
      assertNetworkAccess(ctx.user,ctx.req);
      await assertSecondFactorAccess(ctx.user,ctx.req);
    }
  }
  return next();
});
export const publicProcedure = deviceProcedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = deviceProcedure.use(requireUser);

export const adminProcedure = deviceProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
