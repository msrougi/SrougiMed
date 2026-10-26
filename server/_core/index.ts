import {mountCloudflareAccess} from "../cloudflareAccess";
import { restoreRecordNumbers } from "../restoreRecordNumbers";
import { prepareChatMed } from "../prepareChatMed";
import { prepareNetworkAccess } from "../prepareNetworkAccess";
import { preparePatientFax } from "../preparePatientFax";
import { preparePatientContactFields } from "../preparePatientContactFields";
import { getDb } from "../db";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    const database = await getDb();
    if (!database) throw new Error("Database not available for record-number migration");
    const connection = await database.$client.promise().getConnection();
    try {
      await prepareChatMed(connection);
      await prepareNetworkAccess(connection);
      const faxResult=await preparePatientFax(connection);
      console.log("[patient-fax]",JSON.stringify(faxResult));
      const contactFieldsResult=await preparePatientContactFields(connection);
      console.log("[patient-contact-fields]",JSON.stringify(contactFieldsResult));
      const result = await restoreRecordNumbers(connection);
      console.log("[record-numbers]", JSON.stringify(result));
    } finally { connection.release(); }
  }
  const app = express();
  const server = createServer(app);
  // Configure Render health checks to /healthz before enabling Access.
  mountCloudflareAccess(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(error=>{
  console.error(error);
  process.exit(1);
});
