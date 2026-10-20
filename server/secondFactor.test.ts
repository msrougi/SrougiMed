import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import jwt from "jsonwebtoken";
import {assertSecondFactorAccess} from "./trustedDevices";
import {makeEmailProof,networkDecision,validateNetworkConfiguration} from "./networkAccess";
const user={id:1,username:"test",password:"synthetic",email:"f@example.invalid"};
const req=()=>({headers:{"user-agent":"Fixture"}} as any);
beforeEach(()=>{vi.stubEnv("SECOND_FACTOR_ENABLED","true");vi.stubEnv("JWT_SECRET","synthetic-key");});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("2FA geral independente da rede",()=>{
it("exige código para todos mesmo sem IP de escritório",()=>{
for(const username of ["rose","bia","admin","teste"])expect(networkDecision({...user,username},req())).toBe("code");
expect(makeEmailProof(user,req()).emailCodeIp).toBe("");
});
it("sessão antiga sem prova não consegue acessar; prova sem lembrar expira",async()=>{
const r=req();await expect(assertSecondFactorAccess(user,r)).rejects.toThrow("código");
const proof=makeEmailProof(user,r);r.headers.cookie="app_session_id="+jwt.sign({userId:1,...proof},"synthetic-key");
await expect(assertSecondFactorAccess(user,r)).resolves.toBeUndefined();
await expect(assertSecondFactorAccess({...user,password:"changed"},r)).rejects.toThrow("código");
vi.spyOn(Date,"now").mockReturnValue(proof.emailCodeAt+13*3600000);
await expect(assertSecondFactorAccess(user,r)).rejects.toThrow("código");
});
it("configuração sem remetente não permite ativação",()=>{
vi.stubEnv("RESEND_API_KEY","");expect(()=>validateNetworkConfiguration()).toThrow("SECOND_FACTOR_EMAIL_NOT_CONFIGURED");
});
});
