import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { assertDeviceAccess } from "../deviceAccess";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
const deviceProcedure = t.procedure.use(async ({ ctx, path, next }) => {
  // Logout and switching accounts must remain possible from a blocked session.
  if (ctx.user && path !== "auth.logout" && path !== "customAuth.login") {
    assertDeviceAccess(ctx.user, ctx.req.headers ?? {});
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
