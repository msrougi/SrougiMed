import {accessLoginFlowEnabled} from "./cloudflareLoginFlow";
import {cloudflareAccessEnabled,assertAccessAccountsReady} from "./cloudflareAccess";
import type { Connection } from "mysql2/promise";
import {prepareLoginEmails} from "./prepareLoginEmails";
import {authRecipientAllowed} from "./authEmail";
import { z } from "zod";
import { networkPolicyEnabled,validateNetworkConfiguration } from "./networkAccess";
import { remoteCodeLogins } from "../shared/networkAccess";

export async function prepareNetworkAccess(db:Pick<Connection,"query">) {
  validateNetworkConfiguration();
  await db.query(`CREATE TABLE IF NOT EXISTS srougi_login_codes (
    id CHAR(64) CHARACTER SET ascii PRIMARY KEY,userId INT NOT NULL,codeHash CHAR(64) CHARACTER SET ascii NOT NULL,
    sourceIp VARCHAR(45) NOT NULL,agentHash CHAR(64) CHARACTER SET ascii NOT NULL,accountHash CHAR(64) CHARACTER SET ascii NOT NULL,
    attempts INT NOT NULL DEFAULT 0,consumed BOOLEAN NOT NULL DEFAULT 0,ready BOOLEAN NOT NULL DEFAULT 0,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),expiresAt DATETIME(3) NOT NULL,
    KEY login_codes_user_time(userId,createdAt),KEY login_codes_expiry(expiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS srougi_trusted_devices (
    id CHAR(64) CHARACTER SET ascii PRIMARY KEY,userId INT NOT NULL,tokenHash CHAR(64) CHARACTER SET ascii NOT NULL,
    accountHash CHAR(64) CHARACTER SET ascii NOT NULL,agentHash CHAR(64) CHARACTER SET ascii NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT 0,createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),expiresAt DATETIME(3) NOT NULL,
    KEY trusted_user(userId),KEY trusted_expiry(expiresAt)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await prepareLoginEmails(db);
  if(cloudflareAccessEnabled()){
    const [accounts]=await db.query<any[]>(accessLoginFlowEnabled()?"SELECT id,username,role,email FROM users":"SELECT email FROM users");
    assertAccessAccountsReady(accounts);
    return;
  }
  if(process.env.SECOND_FACTOR_ENABLED==="true") {
    const [accounts]=await db.query<any[]>("SELECT id,email FROM users");
    if(accounts.some(user=>!z.string().email().safeParse(user.email).success))throw new Error("SECOND_FACTOR_ACCOUNT_EMAIL_MISSING");
    if(accounts.some(user=>!authRecipientAllowed(user.email)))throw new Error("SECOND_FACTOR_RECIPIENT_NOT_ALLOWED");
    return;
  }
  if(!networkPolicyEnabled())return;
  const [users]=await db.query<any[]>("SELECT LOWER(TRIM(username)) AS login,email FROM users WHERE LOWER(TRIM(username)) IN ('rose','gislene','rosani','bia')");
  for(const login of [...remoteCodeLogins,"bia"]) {
    const match=users.filter(user=>user.login===login);
    if(match.length!==1 || (login!=="bia" && !z.string().email().safeParse(match[0].email).success))throw new Error(`OFFICE_ACCOUNT_NOT_READY_${login}`);
  }
}
