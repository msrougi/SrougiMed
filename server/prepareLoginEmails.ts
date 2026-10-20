import type {Connection} from "mysql2/promise";
import {z} from "zod";
const emails=z.object({gislene:z.string().trim().email().max(320),rosani:z.string().trim().email().max(320),rose:z.string().trim().email().max(320)}).strict();
export async function prepareLoginEmails(db:Pick<Connection,"query">) {
  const raw=process.env.AUTH_LOGIN_EMAILS_JSON;
  if(!raw)return;
  let parsed:z.infer<typeof emails>;
  try{parsed=emails.parse(JSON.parse(raw));}catch{throw Error("AUTH_LOGIN_EMAILS_INVALID");}
  await db.query("START TRANSACTION");
  try{
    const [users]=await db.query<any[]>("SELECT id,LOWER(TRIM(username)) AS login,email FROM users WHERE LOWER(TRIM(username)) IN ('gislene','rosani','rose') ORDER BY id FOR UPDATE");
    for(const login of ["gislene","rosani","rose"] as const)if(users.filter(user=>user.login===login).length!==1)throw Error("AUTH_LOGIN_ACCOUNT_NOT_UNIQUE");
    for(const user of users) {
      const email=parsed[user.login as keyof typeof parsed];
      if(user.email!==email)await db.query("UPDATE users SET email=? WHERE id=?",[email,user.id]);
    }
    await db.query("COMMIT");
  }catch(error){await db.query("ROLLBACK");throw error;}
}
