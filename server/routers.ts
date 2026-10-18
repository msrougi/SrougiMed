import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { patientImportSchema } from "../shared/patientImport";
import jwtModule from "jsonwebtoken";
const jwt = jwtModule as any;
import { ENV } from "./_core/env";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Autenticação customizada
  customAuth: router({
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { authenticateUser } = await import("./db");
        const user = await authenticateUser(input.username, input.password);
        
        if (!user) {
          throw new Error("Usuário ou senha inválidos");
        }

        // Criar sessão usando JWT
        const token = jwt.sign(
          { userId: user.id, username: user.username, role: user.role },
          ENV.cookieSecret,
          { expiresIn: "7d" }
        );

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
          },
        };
      }),
    
    getCurrentUser: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) {
        return null;
      }
      return ctx.user;
    }),
  }),

  // Gerenciamento de pacientes
  patients: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(1, "Nome é obrigatório"),
        address: z.string().trim().min(1, "Endereço é obrigatório"),
        district: z.string().max(100).optional(),
        cep: z.string().trim().min(1, "CEP é obrigatório"),
        phone: z.string().max(40).optional(),
        mobile: z.string().max(40).optional(),
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
      .input(z.object({
        name: z.string().optional(),
        code: z.string().optional(),
        birthDate: z.string().optional(),
        city: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
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
      .input(z.object({
        name: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { searchPhoneBook } = await import("./db");
        return await searchPhoneBook(input.name, input.limit, input.offset);
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
    patients: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Acesso negado");
      }
      const { getAllPatients } = await import("./db");
      return await getAllPatients();
    }),
    getAllPatients: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Acesso negado");
      }
      const { getAllPatients } = await import("./db");
      return await getAllPatients();
    }),
  }),


  // Importação de dados
  importData: router({
    importPatients: protectedProcedure
      .input(z.array(patientImportSchema).max(1000))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }
        const { importPatients } = await import("./db");
        return await importPatients(input);
      }),
  }),

  // Administração de usuários
  admin: router({
    listUsers: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Acesso negado");
      }
      const { getAllUsers } = await import("./db");
      return await getAllUsers();
    }),

    createUser: protectedProcedure
      .input(z.object({
        username: z.string(),
        password: z.string(),
        name: z.string().optional(),
        role: z.enum(["admin", "user"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }
        const { createUser } = await import("./db");
        await createUser(input);
        return { success: true };
      }),

    deleteUser: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }
        const { deleteUser } = await import("./db");
        await deleteUser(input.id);
        return { success: true };
      }),

    updateUserRole: protectedProcedure
      .input(z.object({
        id: z.number(),
        role: z.enum(["admin", "user"]),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user?.role !== "admin") {
          throw new Error("Acesso negado");
        }
        const { updateUserRole } = await import("./db");
        await updateUserRole(input.id, input.role);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;

