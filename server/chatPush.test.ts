import {describe,it,expect} from "vitest";
import {createECDH} from "node:crypto";
import {allowedPushEndpoint,chatPushSchema,CHAT_ALERT_BODY} from "../shared/chatAlerts";
import {chatVapidKeys} from "./chatPush";

describe("segurança dos avisos ChatMed",()=>{
  it("aceita apenas endpoints HTTPS dos navegadores, sem URLs arbitrárias",()=>{
    for(const endpoint of ["https://fcm.googleapis.com/wp/fixture","https://updates.push.services.mozilla.com/wpush/v2/fixture","https://web.push.apple.com/fixture","https://wns2-fixture.notify.windows.com/w/?fixture"] )expect(allowedPushEndpoint(endpoint)).toBe(true);
    for(const endpoint of ["http://fcm.googleapis.com/a","https://localhost/a","https://127.0.0.1/a","https://fcm.googleapis.com.evil.test/a","https://fcm.googleapis.com:8443/a","https://user:pass@fcm.googleapis.com/a","file:///fixture"])expect(allowedPushEndpoint(endpoint)).toBe(false);
  });
  it("valida chaves, limites e recusa parâmetros de destinatário e conteúdo",()=>{
    const valid={endpoint:"https://fcm.googleapis.com/wp/fixture",keys:{p256dh:"A".repeat(87),auth:"B".repeat(22)},sound:true};
    expect(chatPushSchema.safeParse(valid).success).toBe(true);
    for(const extra of [{userId:2},{body:"não enviar"},{endpoint:"https://localhost"},{keys:{p256dh:"short",auth:"bad"}}])expect(chatPushSchema.safeParse({...valid,...extra}).success).toBe(false);
    expect(CHAT_ALERT_BODY).toBe("Você tem uma nova mensagem no ChatMed. Abra o SrougiMed para ler.");
  });
  it("mantém a chave VAPID estável, válida e isolada do segredo da sessão",()=>{
    const secret="synthetic-test-key-for-web-push";
    const first=chatVapidKeys(secret);
    expect(chatVapidKeys(secret)).toEqual(first);
    expect(chatVapidKeys(secret+"changed")).not.toEqual(first);
    const key=createECDH("prime256v1");key.setPrivateKey(Buffer.from(first.privateKey,"base64url"));
    expect(key.getPublicKey().toString("base64url")).toBe(first.publicKey);
    expect(first.privateKey).not.toBe(secret);
    expect(()=>chatVapidKeys("")).toThrow();
  });
});
