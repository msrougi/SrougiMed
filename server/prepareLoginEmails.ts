import type {Connection} from "mysql2/promise";
import {z} from "zod";
import {isSharedOwnerEmail} from "./accessEmailPolicy";
const email=z.string().trim().email().max(320).transform(value=>value.toLowerCase());
const emails=z.object({gislene:email,rosani:email,rose:email,miguel:email.optional(),msrougi:email.optional(),admin:email.optional()}).strict();
export async function prepareLoginEmails(db:Pick<Connection,"query">) {
  const raw=process.env.AUTH_LOGIN_EMAILS_JSON;
  if(!raw)return;
  let parsed:z.infer<typeof emails>;
  try{parsed=emails.parse(JSON.parse(raw));}catch{throw Error("AUTH_LOGIN_EMAILS_INVALID");}
  await db.query("START TRANSACTION");
  try{
    const logins=Object.keys(parsed);
    const [users]=await db.query<any[]>("SELECT id,LOWER(TRIM(username)) AS login,email FROM users ORDER BY id FOR UPDATE");
    for(const login of logins)if(users.filter(user=>user.login===login).length!==1)throw Error("AUTH_LOGIN_ACCOUNT_NOT_UNIQUE");
    const proposed=users.map(user=>({...user,email:parsed[user.login as keyof typeof parsed] ?? user.email}));
    for(const login of logins){
      const target=proposed.find(user=>user.login===login)!;
      const matches=proposed.filter(user=>String(user.email || "").trim().toLowerCase()===target.email);
      if(matches.length!==1 && !isSharedOwnerEmail(target.email,matches))throw Error("AUTH_LOGIN_EMAIL_NOT_UNIQUE");
    }
    for(const user of users.filter(user=>logins.includes(user.login))) {
      const email=parsed[user.login as keyof typeof parsed];
      if(user.email!==email)await db.query("UPDATE users SET email=? WHERE id=?",[email,user.id]);
    }
    await db.query("COMMIT");
  }catch(error){await db.query("ROLLBACK");throw error;}
}
