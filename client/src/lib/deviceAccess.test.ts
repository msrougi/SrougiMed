// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { deviceAccessHint } from "./deviceAccess";
afterEach(()=>vi.restoreAllMocks());
describe("identificação do aparelho no navegador",()=>{
  it("identifica iPad em modo de navegação desktop",()=>{
    vi.spyOn(navigator,"userAgent","get").mockReturnValue("Mozilla/5.0 Macintosh Safari/605.1.15");
    vi.spyOn(navigator,"platform","get").mockReturnValue("MacIntel");
    Object.defineProperty(navigator,"maxTouchPoints",{value:5,configurable:true});
    expect(deviceAccessHint()).toBe("mobile");
    Object.defineProperty(navigator,"maxTouchPoints",{value:0,configurable:true});
    expect(deviceAccessHint()).toBe("desktop");
  });
  it("reconhece Android e mantém Windows desktop",()=>{
    vi.spyOn(navigator,"userAgent","get").mockReturnValue("Mozilla/5.0 Android 14 Mobile");
    expect(deviceAccessHint()).toBe("mobile");
    vi.spyOn(navigator,"userAgent","get").mockReturnValue("Mozilla/5.0 Windows NT 10.0 Win64 x64 Chrome/140.0");
    vi.spyOn(navigator,"platform","get").mockReturnValue("Win32");
    expect(deviceAccessHint()).toBe("desktop");
  });
});
