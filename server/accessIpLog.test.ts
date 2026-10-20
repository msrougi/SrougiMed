import { afterEach, describe, expect, it, vi } from "vitest";
import { accessIpRecord, createAccessIpLogger } from "./accessIpLog";
const user = {id:7, username:"Gislene",password:"never-log-this",email:"private@example.invalid"};
const request = (ip="198.51.100.2") => ({headers:{"cf-connecting-ip":ip,"x-forwarded-for":`${ip}, 192.0.2.1`,cookie:"secret-cookie",authorization:"secret-auth"},socket:{remoteAddress:"::ffff:127.0.0.1"}} as any);
afterEach(()=>vi.unstubAllEnvs());
describe("registro de IP de acesso",()=>{
  it("registra qualquer conta e distingue candidatos de IP verificado sem dados de pacientes ou credenciais",()=>{
    vi.stubEnv("OFFICE_IP_HEADER_VERIFIED","false");
    const record=accessIpRecord(user,request(),"session");
    expect(record).toMatchObject({login:"Gislene",userId:7,verifiedIp:null,candidates:{connecting:"198.51.100.2",forwarded:["198.51.100.2","192.0.2.1"],socket:"127.0.0.1"}});
    expect(JSON.stringify(record)).not.toMatch(/never-log-this|private@|secret-cookie|secret-auth/);
  });
  it("limita repetições a cinco minutos e registra imediatamente mudança de rede ou novo login",()=>{
    let time=0;const emit=vi.fn(),write=createAccessIpLogger(emit,()=>time);
    write(user,request());write(user,request());expect(emit).toHaveBeenCalledTimes(1);
    write(user,request("198.51.100.3"));write(user,request(),"login");expect(emit).toHaveBeenCalledTimes(3);
    time+=300000;write(user,request());expect(emit).toHaveBeenCalledTimes(4);
  });
  it("descarta conteúdo inválido, listas enormes e múltiplos valores em cabeçalhos simples",()=>{
    const req=request();req.headers["cf-connecting-ip"]="not-an-ip\nforged";req.headers["true-client-ip"]=["198.51.100.2"];req.headers["x-forwarded-for"]="a".repeat(3000);
    expect(accessIpRecord(user,req,"session").candidates).toEqual({connecting:null,trueClient:null,forwarded:[],socket:"127.0.0.1"});
  });
  it("falha no diagnóstico não interrompe a sessão",()=>{
    expect(()=>createAccessIpLogger(()=>{throw Error("fixture");})(user,request())).not.toThrow();
  });
});
