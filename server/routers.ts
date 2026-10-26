import {nativeEmailLoginEnabled,sendNativeEmailCode,NATIVE_PENDING_COOKIE,nativePendingOptions} from "./nativeEmailLogin";
import {isSecondFactorPasswordOnly} from "./secondFactorPolicy";
import {accessLoginFlowEnabled,biaDeviceAccessEnabled,cloudflareLoginCallbackEnabled,isBiaDeviceAccessUser,isBiaPasswordOnly,issueSelectiveSession,startCloudflareLogin,ACCESS_PENDING_COOKIE} from "./cloudflareLoginFlow";
import {cloudflareAccessEnabled,assertAccessUser} from "./cloudflareAccess";
import {secondFactorEnabled,trustedDeviceStore,TRUST_COOKIE,trustCookieOptions} from "./trustedDevices";
import { recordNumberSchema } from "../shared/recordNumber";
import { chatMedRouter } from "./chatMedRouter";
import { assertDeviceAccess } from "./deviceAccess";
import { beginNetworkLogin,emailCodeStore } from "./loginEmailCode";
import { recordAccessIp } from "./accessIpLog";
import {accountFingerprint,type EmailProof} from "./networkAccess";
import type { TrpcContext } from "./_core/context";
import { chatGroupSchema } from "../shared/chatMed";
import { changePasswordSchema } from "../shared/changePassword";
import { patientSearchSchema, phoneBookSearchSchema, legacyPatientSearchSchema, legacyPhoneBookSearchSchema } from "../shared/pagination";
import { TRPCError } from "@trpc/server";
import { updateUserSchema } from "../shared/userManagement";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import { patientImportSchema } from "../shared/patientImport";
import jwtModule from "jsonwebtoken";
const jwt = jwtModule as any;
import { ENV } from "./_core/env";

function withoutPassword<T extends { password?: unknown }>(user: T | null) {
  if (!user) return null;
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

function issueLogin(user:{id:number;username?:string|null;name?:string|null;role?:string;email?:string|null;password?:string|null},ctx:TrpcContext,proof?:EmailProof,access?:{accessAccount:string;accessSubject:string}) {
  const token=jwt.sign({userId:user.id,username:user.username,role:user.role,...proof,...access,...(isSecondFactorPasswordOnly(user)?{passwordOnlyAccount:accountFingerprint(user)}:{})},ENV.cookieSecret,{expiresIn:"7d"});
  ctx.res.cookie(COOKIE_NAME,token,getSessionCookieOptions(ctx.req));
  recordAccessIp(user,ctx.req,"login");
  return {success:true as const,requiresCode:false as const,user:{id:user.id,username:user.username,name:user.name,role:user.role}};
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  chatMed: chatMedRouter,
  auth: router({
    me: publicProcedure.query(opts => withoutPassword(opts.ctx.user)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if(nativeEmailLoginEnabled())ctx.res.clearCookie(NATIVE_PENDING_COOKIE,nativePendingOptions);
      if(cloudflareLoginCallbackEnabled())ctx.res.clearCookie(ACCESS_PENDING_COOKIE,{httpOnly:true,secure:true,sameSite:"lax",path:"/"});
      return {
        success: true,
      } as const;
    }),
  }),

  // Autenticação customizada
  customAuth: router({
    sendLoginCode:publicProcedure.input(z.object({}).strict()).mutation(({ctx})=>sendNativeEmailCode(ctx.req)),
    verifyLoginCode: publicProcedure.input(z.object({challengeId:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().trim().regex(/^[0-9]{6}$/),trustDevice:z.boolean().default(false)}).strict()).mutation(async({input,ctx})=>{
      if(cloudflareAccessEnabled())throw new TRPCError({code:"BAD_REQUEST",message:"A confirmação de acesso é feita pela Cloudflare. Entre com usuário e senha."});
      const result=await (await emailCodeStore()).verify(input.challengeId,input.code,ctx.req);
      if(secondFactorEnabled() && input.trustDevice){
        const trusted=await (await trustedDeviceStore()).create(result.user as any,ctx.req);
        ctx.res.cookie(TRUST_COOKIE,trusted.token,trustCookieOptions);
        result.proof.trustedDeviceId=trusted.id;
      } else if(secondFactorEnabled()){
        ctx.res.clearCookie(TRUST_COOKIE,{...trustCookieOptions,maxAge:-1});
      }
      if(nativeEmailLoginEnabled())ctx.res.clearCookie(NATIVE_PENDING_COOKIE,nativePendingOptions);
      return issueLogin(result.user as any,ctx,result.proof);
    }),
    changePassword: protectedProcedure.input(changePasswordSchema).mutation(async ({ input, ctx }) => {
      const { changeOwnPassword } = await import("./db");
      return changeOwnPassword(ctx.user.id, input);
    }),
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { authenticateUser } = await import("./db");
        const user = await authenticateUser(input.username, input.password);
        
        if (!user) {
          throw new Error("Usuário ou senha inválidos");
        }
        assertDeviceAccess(user, ctx.req.headers ?? {});

        if(biaDeviceAccessEnabled() && isBiaDeviceAccessUser(user))return startCloudflareLogin(user,ctx.req,ctx.res);
        if(accessLoginFlowEnabled()){
          if(isBiaPasswordOnly(user))return issueSelectiveSession(user,ctx.req,ctx.res);
          return startCloudflareLogin(user,ctx.req,ctx.res);
        }
        if(cloudflareAccessEnabled()){
          const identity=await assertAccessUser(user,ctx.req);
          if(!identity)throw new TRPCError({code:"FORBIDDEN",message:"Confirme o acesso pela Cloudflare."});
          return issueLogin(user,ctx,undefined,{accessAccount:accountFingerprint(user),accessSubject:identity.subject});
        }
        const challenge=await beginNetworkLogin(user,ctx.req,ctx.res);
        if(challenge){
          if("trustedProof" in challenge)return issueLogin(user,ctx,challenge.trustedProof);
          return challenge;
        }
        return issueLogin(user,ctx);

      }),
    
    getCurrentUser: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) {
        return null;
      }
      return withoutPassword(ctx.user);
    }),
  }),

  // Gerenciamento de pacientes
  patients: router({
    create: protectedProcedure
      .input(z.object({
        code: recordNumberSchema,
        name: z.string().trim().min(1, "Nome é obrigatório"),
        address: z.string().trim().min(1, "Endereço é obrigatório"),
        district: z.string().max(100).optional(),
        cep: z.string().trim().min(1, "CEP é obrigatório"),
        phone: z.string().max(40).optional(),
        mobile: z.string().max(40).optional(),
        fax: z.string().max(65535).optional(),
        skinColorId: z.number().optional(),
        city: z.string().trim().min(1, "Cidade é obrigatória"),
        state: z.string().trim().min(1, "Estado é obrigatório"),
        rg: z.string().optional(),
        cpf: z.string().trim().min(1, "CPF é obrigatório"),
        birthDate: z.string().trim().min(1, "Data de nascimento é obrigatória"),
        birthPlace: z.string().optional(),
        motherName: z.string().max(200).optional(),
        fatherName: z.string().max(200).optional(),
        responsibleName: z.string().max(200).optional(),
        responsiblePhone: z.string().max(40).optional(),
        maritalStatusId: z.number().min(1, "Estado civil é obrigatório"),
        genderId: z.number().min(1, "Sexo é obrigatório"),
        email: z.string().optional(),
        referredBy: z.string().optional(),
        registrationDate: z.string().optional(),
        occupation: z.string().optional(),
        additionalInfo1: z.string().optional(),
        additionalInfo2: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createPatient } = await import("./db");
        await createPatient(input);
        return { success: true };
      }),

    search: protectedProcedure
      .input(legacyPatientSearchSchema)
      .mutation(async ({ input }) => {
        const { searchPatientsLegacy } = await import("./db");
        return searchPatientsLegacy(input);
      }),
    searchPage: protectedProcedure
      .input(patientSearchSchema)
      .mutation(async ({ input }) => {
        const { searchPatients } = await import("./db");
        return await searchPatients(input);
      }),

    getById: protectedProcedure
      .input(z.number())
      .query(async ({ input }) => {
        const { getPatientById } = await import("./db");
        return await getPatientById(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: patientImportSchema.partial(),
      }))
      .mutation(async ({ input }) => {
        const { updatePatient } = await import("./db");
        await updatePatient(input.id, input.data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deletePatient } = await import("./db");
        await deletePatient(input.id);
        return { success: true };
      }),

    getSkinColors: protectedProcedure.query(async () => {
      const { getSkinColors } = await import("./db");
      return await getSkinColors();
    }),

    getMaritalStatuses: protectedProcedure.query(async () => {
      const { getMaritalStatuses } = await import("./db");
      return await getMaritalStatuses();
    }),

    getGenders: protectedProcedure.query(async () => {
      const { getGenders } = await import("./db");
      return await getGenders();
    }),
  }),

  // Agenda telefônica
  phoneBook: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        email: z.string().optional(),
        occupation: z.string().optional(),
        category: z.string().optional(),
        phone: z.string().optional(),
        observations: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { createPhoneBookEntry } = await import("./db");
        await createPhoneBookEntry(input);
        return { success: true };
      }),

    search: protectedProcedure
      .input(legacyPhoneBookSearchSchema)
      .mutation(async ({ input }) => {
        const { searchPhoneBookLegacy } = await import("./db");
        return searchPhoneBookLegacy(input);
      }),
    searchPage: protectedProcedure
      .input(phoneBookSearchSchema)
      .mutation(async ({ input }) => {
        const { searchPhoneBook } = await import("./db");
        return await searchPhoneBook(input);
      }),

    getById: protectedProcedure
      .input(z.number())
      .query(async ({ input }) => {
        const { getPhoneBookEntryById } = await import("./db");
        return await getPhoneBookEntryById(input);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          occupation: z.string().optional(),
          category: z.string().optional(),
          phone: z.string().optional(),
          observations: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        const { updatePhoneBookEntry } = await import("./db");
        await updatePhoneBookEntry(input.id, input.data);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        const { deletePhoneBookEntry } = await import("./db");
        await deletePhoneBookEntry(input);
        return { success: true };
      }),
  }),

  // Exportação de dados
  export: router({
    patients: adminProcedure.mutation(async ({ ctx }) => {
      const { getAllPatients } = await import("./db");
      return await getAllPatients();
    }),
    getAllPatients: adminProcedure.query(async ({ ctx }) => {
      const { getAllPatients } = await import("./db");
      return await getAllPatients();
    }),
  }),


  // Importação de dados
  importData: router({
    importPatients: adminProcedure
      .input(z.array(patientImportSchema.extend({ code: recordNumberSchema })).max(1000))
      .mutation(async ({ ctx, input }) => {
        const { importPatients } = await import("./db");
        return await importPatients(input);
      }),
  }),

  // Administração de usuários
  admin: router({
    revokeTrustedDevices:adminProcedure.input(z.object({userId:z.number().int().positive()}).strict()).mutation(async({input})=>{
      if(cloudflareAccessEnabled())throw new TRPCError({code:"BAD_REQUEST",message:"Os acessos são gerenciados pela Cloudflare. Revogue a sessão no painel Zero Trust."});
      await (await trustedDeviceStore()).revoke(input.userId);return {success:true};
    }),
    updateUser: adminProcedure.input(updateUserSchema).mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id && input.role !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover seu próprio acesso de administrador" });
      }
      const { updateManagedUser } = await import("./db");
      return updateManagedUser(input);
    }),
    listUsers: adminProcedure.mutation(async ({ ctx }) => {
      const { getAllUsers } = await import("./db");
      return await getAllUsers();
    }),

    createUser: adminProcedure
      .input(z.object({
        username: z.string(),
        password: z.string(),
        name: z.string().optional(),
        role: z.enum(["admin", "user"]),
        chatGroup: chatGroupSchema.optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { createUser } = await import("./db");
        await createUser(input);
        return { success: true };
      }),

    deleteUser: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode excluir seu próprio usuário" });
        }
        const { deleteUser } = await import("./db");
        await deleteUser(input.id);
        return { success: true };
      }),

    updateUserRole: adminProcedure
      .input(z.object({
        id: z.number(),
        role: z.enum(["admin", "user"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id && input.role !== "admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover seu próprio acesso de administrador" });
        }
        const { updateUserRole } = await import("./db");
        await updateUserRole(input.id, input.role);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

