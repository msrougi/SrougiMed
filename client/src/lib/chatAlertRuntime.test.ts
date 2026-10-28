// @vitest-environment jsdom
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
beforeEach(()=>{vi.useFakeTimers();vi.resetModules();});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();delete (navigator as any).serviceWorker;});
describe("esperas limitadas dos avisos",()=>{
  it("libera a operação após timeout e ignora conclusão tardia",async()=>{
    const {chatAlertStep}=await import("./chatAlerts");
    let finish!:(value:string)=>void;
    const operation=chatAlertStep(()=>new Promise<string>(resolve=>finish=resolve),"conectar ao navegador",Date.now()+20000,500);
    const result=expect(operation).rejects.toThrow("conectar ao navegador");
    await vi.advanceTimersByTimeAsync(500);await result;
    finish("tarde");await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("não chama outra etapa quando o orçamento total expirou",async()=>{
    const {chatAlertStep}=await import("./chatAlerts");const operation=vi.fn(async()=>true);
    await expect(chatAlertStep(operation,"salvar",Date.now()-1)).rejects.toThrow("Tempo esgotado");
    expect(operation).not.toHaveBeenCalled();
  });
  it("áudio suspenso não fica pendente e pode ser liberado em outro clique",async()=>{
    const context={state:"suspended",resume:vi.fn(()=>new Promise<void>(()=>{}))};
    vi.stubGlobal("AudioContext",function(){return context;});
    const {unlockChatSound}=await import("./chatAlerts");const result=unlockChatSound();
    await vi.advanceTimersByTimeAsync(1500);expect(await result).toBe(false);
    context.state="running";expect(await unlockChatSound()).toBe(true);
    expect(context.resume).toHaveBeenCalledTimes(1);
  });
  it("usa o registro ativo sem esperar o ready global indefinidamente",async()=>{
    const registration={active:{state:"activated"}};
    const serviceWorker={register:vi.fn(async()=>registration),get ready(){throw Error("Não usar ready global");}};
    Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:serviceWorker});
    const {chatPushRegistration}=await import("./chatAlerts");
    expect(await chatPushRegistration()).toBe(registration);
  });
  it("aguarda a instalação correta e limpa os listeners",async()=>{
    const worker=Object.assign(new EventTarget(),{state:"installing"});
    const registration=Object.assign(new EventTarget(),{active:null as typeof worker|null,installing:worker,waiting:null});
    const remove=vi.spyOn(worker,"removeEventListener");
    Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{register:async()=>registration}});
    const {chatPushRegistration}=await import("./chatAlerts");const result=chatPushRegistration();
    await vi.advanceTimersByTimeAsync(0);
    worker.state="activated";registration.active=worker;worker.dispatchEvent(new Event("statechange"));
    expect(await result).toBe(registration);expect(remove).toHaveBeenCalled();
  });
  it("instalação que não termina expira em vez de aguardar para sempre",async()=>{
    const worker=Object.assign(new EventTarget(),{state:"installing"});
    const registration=Object.assign(new EventTarget(),{active:null,installing:worker,waiting:null});
    const remove=vi.spyOn(worker,"removeEventListener");
    Object.defineProperty(navigator,"serviceWorker",{configurable:true,value:{register:async()=>registration}});
    const {chatPushRegistration}=await import("./chatAlerts");const result=chatPushRegistration();
    const assertion=expect(result).rejects.toThrow("ativar o serviço");
    await vi.advanceTimersByTimeAsync(8000);await assertion;expect(remove).toHaveBeenCalled();
  });
});
