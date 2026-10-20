import { beforeEach,afterEach,describe,expect,it,vi } from "vitest";
import jwt from "jsonwebtoken";
import { assertNetworkAccess,makeEmailProof,networkDecision,normalizeIp,clientIp,validateNetworkConfiguration } from "./networkAccess";
const user={id:1,username:"rose",password:"synthetic-hash",email:"fixture@example.invalid"};
const req=(ip="198.51.100.2",agent="Fixture Desktop")=>({headers:{"true-client-ip":ip,"user-agent":agent}} as any);
beforeEach(()=>{
  vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","true");vi.stubEnv("OFFICE_PUBLIC_IP","198.51.100.1");
  vi.stubEnv("OFFICE_CLIENT_IP_HEADER","true-client-ip");vi.stubEnv("OFFICE_IP_HEADER_VERIFIED","true");vi.stubEnv("JWT_SECRET","synthetic-network-test-key");
  vi.stubEnv("RESEND_API_KEY","synthetic");vi.stubEnv("AUTH_EMAIL_FROM","fixture@example.invalid");
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("política de acesso por rede",()=>{
  it("normaliza IPv4 e IPv6 sem aceitar listas ou IP inválido",()=>{
    expect(normalizeIp("::ffff:198.51.100.1")).toBe("198.51.100.1");expect(normalizeIp("2001:0DB8:0:0:0:0:0:1")).toBe("2001:db8::1");
    for(const ip of ["198.51.100.1,203.0.113.5","invalid","fe80::1%eth0",""])expect(normalizeIp(ip)).toBeNull();
  });
  it("permite senha na rede do escritório; fora dela, código para as três e bloqueio para Bia",()=>{
    for(const username of ["rose","gislene","rosani","bia"]){
      expect(networkDecision({...user,username},req("198.51.100.1"))).toBe("allow");
      expect(networkDecision({...user,username},req())).toBe(username==="bia"?"deny":"code");
    }
    expect(networkDecision({...user,username:"admin"},req())).toBe("allow");
  });
  it("não confia em X-Forwarded-For nem em cabeçalho ainda não validado",()=>{
    const request={headers:{"x-forwarded-for":"198.51.100.1,203.0.113.5"}} as any;
    expect(clientIp(request)).toBeNull();expect(networkDecision(user,request)).toBe("code");
    vi.stubEnv("OFFICE_IP_HEADER_VERIFIED","false");expect(clientIp(req("198.51.100.1"))).toBeNull();
    expect(()=>validateNetworkConfiguration()).toThrow("OFFICE_NETWORK_NOT_VERIFIED");
  });
  it("permanece inativa até configuração e ativação explícitas",()=>{
    vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","false");
    expect(networkDecision(user,req())).toBe("allow");expect(networkDecision({...user,username:"bia"},req())).toBe("allow");
    expect(()=>assertNetworkAccess(user,req())).not.toThrow();
  });
  it("sessão assinada sem segundo fator não pode sair da rede do escritório",()=>{
    expect(()=>assertNetworkAccess(user,req())).toThrow("código");
    expect(()=>assertNetworkAccess(user,req("198.51.100.1"))).not.toThrow();
    expect(()=>assertNetworkAccess({...user,username:"bia"},req())).toThrow("rede do escritório");
  });
  it("vincula a confirmação à conta, IP, navegador e validade de 12 horas",()=>{
    const request=req(),proof=makeEmailProof(user,request);
    const token=jwt.sign({userId:1,...proof},process.env.JWT_SECRET!,{expiresIn:"7d"});
    request.headers.cookie="app_session_id="+token;
    expect(()=>assertNetworkAccess(user,request)).not.toThrow();
    for(const other of [req("198.51.100.3"),req("198.51.100.2","Outro navegador")]){
      other.headers.cookie=request.headers.cookie;expect(()=>assertNetworkAccess(user,other)).toThrow("código");
    }
    expect(()=>assertNetworkAccess({...user,password:"changed"},request)).toThrow("código");
    expect(()=>assertNetworkAccess({...user,email:"other@example.invalid"},request)).toThrow("código");
    const now=Date.now();vi.spyOn(Date,"now").mockReturnValue(now+13*60*60*1000);
    expect(()=>assertNetworkAccess(user,request)).toThrow("código");
  });
});
