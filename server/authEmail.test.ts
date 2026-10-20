import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {sendLoginCode,authEmailConfiguration} from "./authEmail";
const mail={to:"fixture@example.invalid",code:"123456",challengeId:"a".repeat(64)};
const fetchMock=vi.fn();
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const verified=()=>response({success:true,errors:[],result:[{email:mail.to,verified:"2026-01-01T00:00:00Z"}],result_info:{total_pages:1}});
const accepted=(type="queued")=>response({success:true,errors:[],result:{[type]:[mail.to]}});
beforeEach(()=>{
vi.stubEnv("AUTH_EMAIL_PROVIDER","cloudflare");vi.stubEnv("AUTH_EMAIL_FROM","acesso@example.invalid");
vi.stubEnv("AUTH_CLOUDFLARE_ACCOUNT_ID","b".repeat(32));vi.stubEnv("AUTH_CLOUDFLARE_API_TOKEN","synthetic-test-token");
vi.stubEnv("AUTH_EMAIL_ALLOWED_RECIPIENTS",mail.to);vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("envio 2FA via Cloudflare somente a destinatários verificados",()=>{
it.each(["delivered","queued"])("aceita %s com domínio e destinatário corretos",async type=>{
fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(accepted(type));
await sendLoginCode(mail);
expect(fetchMock).toHaveBeenCalledTimes(2);
expect(fetchMock.mock.calls[0][0]).toContain("/email/routing/addresses?verified=true");
const [url,options]=fetchMock.mock.calls[1];
expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/"+"b".repeat(32)+"/email/sending/send");
expect(options).toMatchObject({method:"POST",redirect:"error",headers:{Authorization:"Bearer synthetic-test-token"}});
expect(JSON.parse(options.body)).toMatchObject({from:"acesso@example.invalid",to:mail.to});
expect(JSON.parse(options.body).text).toContain(mail.code);
});
it("não envia a destinatário fora da lista, mesmo antes de consultar API",async()=>{
await expect(sendLoginCode({...mail,to:"other@example.invalid"})).rejects.toThrow("AUTH_EMAIL_RECIPIENT_NOT_ALLOWED");
expect(fetchMock).not.toHaveBeenCalled();
});
it("não envia se a Cloudflare ainda não verificou o endereço",async()=>{
fetchMock.mockResolvedValueOnce(response({success:true,result:[{email:mail.to,verified:null}]}));
await expect(sendLoginCode(mail)).rejects.toThrow("AUTH_EMAIL_DESTINATION_NOT_VERIFIED");
expect(fetchMock).toHaveBeenCalledOnce();
});
it.each([
{success:false,errors:[{code:10102}],result:null},
{success:true,result:{permanent_bounces:[mail.to],queued:[]}},
{success:true,result:{queued:["other@example.invalid"]}},
{success:true,result:null}
])("não aceita sucesso HTTP sem confirmação para o destinatário",async body=>{
fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(response(body));
await expect(sendLoginCode(mail)).rejects.toThrow("AUTH_EMAIL_DELIVERY_FAILED");
});
it("não reenvia automaticamente após timeout nem falha de autorização",async()=>{
fetchMock.mockRejectedValueOnce(new DOMException("synthetic timeout","TimeoutError"));
await expect(sendLoginCode(mail)).rejects.toThrow();expect(fetchMock).toHaveBeenCalledOnce();
fetchMock.mockReset();fetchMock.mockResolvedValueOnce(response({success:false},403));
await expect(sendLoginCode(mail)).rejects.toThrow("AUTH_EMAIL_VERIFICATION_FAILED");expect(fetchMock).toHaveBeenCalledOnce();
});
it("procura destinatário na próxima página da verificação",async()=>{
fetchMock.mockResolvedValueOnce(response({success:true,result:Array.from({length:50},(_,i)=>({email:"f"+i+"@example.invalid",verified:"2026-01-01T00:00:00Z"})),result_info:{total_pages:2}})).mockResolvedValueOnce(verified()).mockResolvedValueOnce(accepted());
await sendLoginCode(mail);expect(fetchMock.mock.calls[1][0]).toContain("page=2");
});
it("exige credenciais e lista válidas, sem colocar dados na URL",()=>{
vi.stubEnv("AUTH_CLOUDFLARE_ACCOUNT_ID","../../untrusted");
expect(()=>authEmailConfiguration()).toThrow("AUTH_EMAIL_NOT_CONFIGURED");
vi.stubEnv("AUTH_CLOUDFLARE_ACCOUNT_ID","b".repeat(32));vi.stubEnv("AUTH_EMAIL_ALLOWED_RECIPIENTS","");
expect(()=>authEmailConfiguration()).toThrow("AUTH_EMAIL_RECIPIENTS_NOT_CONFIGURED");
});
it("preserva Resend com chave de idempotência quando selecionado",async()=>{
vi.stubEnv("AUTH_EMAIL_PROVIDER","resend");vi.stubEnv("RESEND_API_KEY","synthetic-resend");
fetchMock.mockResolvedValueOnce(response({id:"fixture-message"}));
await sendLoginCode(mail);
expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("srougi-login-"+mail.challengeId);
});
});
