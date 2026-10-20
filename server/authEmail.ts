import {z} from "zod";
export type CodeMail={to:string;code:string;challengeId:string};
const mailbox=z.string().trim().email().max(320);
export function authEmailConfiguration() {
  const provider=process.env.AUTH_EMAIL_PROVIDER || "resend";
  const from=mailbox.safeParse(process.env.AUTH_EMAIL_FROM);
  if(!from.success)throw Error("AUTH_EMAIL_NOT_CONFIGURED");
  if(provider==="resend") {
    if(!process.env.RESEND_API_KEY)throw Error("AUTH_EMAIL_NOT_CONFIGURED");
    return {provider,from:from.data,token:process.env.RESEND_API_KEY,accountId:"",allowed:[] as string[]};
  }
  if(provider!=="cloudflare" || !/^[a-f0-9]{32}$/i.test(process.env.AUTH_CLOUDFLARE_ACCOUNT_ID || "") || !process.env.AUTH_CLOUDFLARE_API_TOKEN)throw Error("AUTH_EMAIL_NOT_CONFIGURED");
  const list=(process.env.AUTH_EMAIL_ALLOWED_RECIPIENTS || "").split(",").map(s=>s.trim()).filter(Boolean);
  if(!list.length || list.some(email=>!mailbox.safeParse(email).success))throw Error("AUTH_EMAIL_RECIPIENTS_NOT_CONFIGURED");
  return {provider,from:from.data,token:process.env.AUTH_CLOUDFLARE_API_TOKEN,accountId:process.env.AUTH_CLOUDFLARE_ACCOUNT_ID!,allowed:list.map(s=>s.toLowerCase())};
}
export function authRecipientAllowed(email:string) {
  const config=authEmailConfiguration();
  return config.provider!=="cloudflare" || config.allowed.includes(email.trim().toLowerCase());
}
async function verifiedDestination(base:string,to:string,headers:Record<string,string>,signal:AbortSignal) {
  // No send to arbitrary recipients: verified destinations are the free sending path.
  for(let page=1;page<=20;page++) {
    const response=await fetch(base+"/email/routing/addresses?verified=true&per_page=50&page="+page,{headers,signal,redirect:"error"});
    if(!response.ok)throw Error("AUTH_EMAIL_VERIFICATION_FAILED");
    const body=await response.json() as any;
    if(body.success!==true || !Array.isArray(body.result) || body.errors?.length)throw Error("AUTH_EMAIL_VERIFICATION_FAILED");
    if(body.result.some((row:any)=>typeof row.email==="string" && row.email.toLowerCase()===to.toLowerCase() && typeof row.verified==="string" && Number.isFinite(Date.parse(row.verified))))return;
    const last=Number(body.result_info?.total_pages);
    if(body.result.length<50 || (Number.isFinite(last) && last>0 && page>=last))break;
  }
  throw Error("AUTH_EMAIL_DESTINATION_NOT_VERIFIED");
}
export async function sendLoginCode(mail:CodeMail) {
  const config=authEmailConfiguration();
  const to=mailbox.parse(mail.to);
  if(!/^[0-9]{6}$/.test(mail.code) || !/^[a-f0-9]{64}$/.test(mail.challengeId))throw Error("AUTH_EMAIL_INVALID_MESSAGE");
  const subject="Seu código de acesso ao SrougiMed";
  const text="Seu código de acesso ao SrougiMed é: "+mail.code+"\n\nEle expira em 5 minutos e só pode ser usado uma vez. Nunca compartilhe este código. Se não foi você, ignore este e-mail e avise o administrador.";
  const signal=AbortSignal.timeout(10000);
  if(config.provider==="resend") {
    const response=await fetch("https://api.resend.com/emails",{method:"POST",signal,redirect:"error",
      headers:{Authorization:"Bearer "+config.token,"Content-Type":"application/json","Idempotency-Key":"srougi-login-"+mail.challengeId},
      body:JSON.stringify({from:config.from,to:[to],subject,text})});
    if(!response.ok)throw Error("AUTH_EMAIL_DELIVERY_FAILED");
    return;
  }
  if(!config.allowed.includes(to.toLowerCase()))throw Error("AUTH_EMAIL_RECIPIENT_NOT_ALLOWED");
  const base="https://api.cloudflare.com/client/v4/accounts/"+config.accountId;
  const headers={Authorization:"Bearer "+config.token,"Content-Type":"application/json"};
  await verifiedDestination(base,to,headers,signal);
  // Do not automatically retry: the challenge is invalidated if acceptance is uncertain.
  const response=await fetch(base+"/email/sending/send",{method:"POST",signal,headers,redirect:"error",body:JSON.stringify({from:config.from,to,subject,text})});
  if(!response.ok)throw Error("AUTH_EMAIL_DELIVERY_FAILED");
  const body=await response.json() as any;
  const contains=(items:unknown)=>Array.isArray(items) && items.some(x=>typeof x==="string" && x.toLowerCase()===to.toLowerCase());
  if(body.success!==true || body.errors?.length || contains(body.result?.permanent_bounces) || !(contains(body.result?.delivered) || contains(body.result?.queued)))throw Error("AUTH_EMAIL_DELIVERY_FAILED");
}
