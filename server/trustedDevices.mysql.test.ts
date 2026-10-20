import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from "vitest";
import mysql from "mysql2/promise";
import {TrustedDeviceStore,TRUST_COOKIE,trustCookieOptions} from "./trustedDevices";
import {prepareNetworkAccess} from "./prepareNetworkAccess";
const url=process.env.SROUGI_DEVICE_TEST_DATABASE_URL;
if(url){const u=new URL(url);if(!["127.0.0.1","localhost","[::1]"].includes(u.hostname)||!/^\/srougi_test_devices[a-z0-9_]*$/.test(u.pathname))throw Error("Trusted-device tests require isolated localhost database");}
describe.skipIf(!url)("dispositivos confiáveis — MySQL isolado",()=>{
let pool:mysql.Pool,store:TrustedDeviceStore;
const user={id:1,email:"fixture@example.invalid",password:"synthetic-hash"};
const req=(cookie="",agent="Synthetic")=>({headers:{"user-agent":agent,cookie}} as any);
beforeAll(async()=>{
vi.stubEnv("OFFICE_ACCESS_POLICY_ENABLED","false");vi.stubEnv("SECOND_FACTOR_ENABLED","false");vi.stubEnv("JWT_SECRET","synthetic-only");
pool=mysql.createPool(url!);
await pool.query("CREATE TABLE IF NOT EXISTS users(id INT PRIMARY KEY,email VARCHAR(320),password VARCHAR(255)) ENGINE=InnoDB");
const c=await pool.getConnection();try{await prepareNetworkAccess(c);await prepareNetworkAccess(c);}finally{c.release();}
store=new TrustedDeviceStore(pool);
});
beforeEach(async()=>{
await pool.query("DELETE FROM srougi_trusted_devices");await pool.query("DELETE FROM users");
await pool.query("INSERT INTO users(id,email,password) VALUES(?,?,?)",[1,user.email,user.password]);
});
afterAll(async()=>{await pool?.end();vi.unstubAllEnvs();});
it("guarda somente hash, reconhece cookie e expira em 30 dias sem renovar ao usar",async()=>{
const created=await store.create(user,req());
const [rows]=await pool.query<any[]>("SELECT *,TIMESTAMPDIFF(DAY,NOW(3),expiresAt) AS days FROM srougi_trusted_devices");
expect(rows[0].tokenHash).not.toContain(created.token.split(".")[1]);expect(rows[0].days).toBeGreaterThanOrEqual(29);
const r=req(TRUST_COOKIE+"="+created.token);
expect(await store.fromCookie(user,r)).toBe(created.id);
expect(await new TrustedDeviceStore(pool).fromCookie(user,r)).toBe(created.id);
expect(trustCookieOptions).toMatchObject({secure:true,httpOnly:true,sameSite:"strict",path:"/",maxAge:30*86400000});
await pool.query("UPDATE srougi_trusted_devices SET expiresAt=DATE_SUB(NOW(3),INTERVAL 1 SECOND)");
expect(await store.fromCookie(user,r)).toBeNull();
});
it("rejeita token adulterado, outra conta, navegador e senha/email alterados",async()=>{
const c=await store.create(user,req()),r=req(TRUST_COOKIE+"="+c.token);
expect(await store.fromCookie(user,req(TRUST_COOKIE+"="+c.id+"."+"0".repeat(64)))).toBeNull();
expect(await store.fromCookie({...user,id:2},r)).toBeNull();
expect(await store.fromCookie(user,req(r.headers.cookie,"Other"))).toBeNull();
for(const other of [{...user,password:"changed"},{...user,email:"other@example.invalid"}])expect(await store.fromCookie(other,r)).toBeNull();
});
it("revoga todos os dispositivos da conta e invalida prova de sessão lembrada",async()=>{
const a=await store.create(user,req()),b=await store.create(user,req());
expect(await store.valid(user,req(),a.id)).toBe(true);
await store.revoke(user.id);
expect(await store.valid(user,req(),a.id)).toBe(false);
expect(await store.fromCookie(user,req(TRUST_COOKIE+"="+b.token))).toBeNull();
});
it("não lembra uma conta cuja senha mudou entre código e gravação",async()=>{
await pool.query("UPDATE users SET password='changed' WHERE id=1");
await expect(store.create(user,req())).rejects.toThrow("TRUST_ACCOUNT_CHANGED");
const [rows]=await pool.query<any[]>("SELECT COUNT(*) AS n FROM srougi_trusted_devices");expect(Number(rows[0].n)).toBe(0);
});
});
