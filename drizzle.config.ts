import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: "srougimed.env",
});

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
