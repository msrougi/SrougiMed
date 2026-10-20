// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import ChatEmojiPicker,{CHAT_EMOJIS} from "../components/ChatEmojiPicker";
afterEach(cleanup);
describe("seletor leve de emojis",()=>{
it("mantém o catálogo inteiro e renderiza só a janela visível",()=>{
const select=vi.fn(),close=vi.fn();
render(<ChatEmojiPicker onSelect={select} onClose={close}/>);
expect(CHAT_EMOJIS).toHaveLength(360);
expect(screen.getAllByRole("button",{name:/Inserir /}).length).toBeLessThanOrEqual(36);
expect(screen.queryByRole("button",{name:"Inserir 🧊"})).toBeNull();
fireEvent.scroll(screen.getByRole("group",{name:"Lista de emojis"}),{target:{scrollTop:2048}});
expect(screen.getAllByRole("button",{name:/Inserir /}).length).toBeLessThanOrEqual(36);
fireEvent.click(screen.getByRole("button",{name:"Inserir 🧊"}));expect(select).toHaveBeenCalledWith("🧊");
expect(select).toHaveBeenCalledOnce();
});
it("permite alcançar início e fim pelo teclado e selecionar sem enviar mensagem",()=>{
const select=vi.fn();render(<ChatEmojiPicker onSelect={select} onClose={vi.fn()}/>);
const viewport=screen.getByRole("group",{name:"Lista de emojis"});
fireEvent.keyDown(viewport,{key:"End"});
const last=screen.getByRole("button",{name:"Inserir 🧊"});
expect(document.activeElement).toBe(last);
fireEvent.keyDown(last,{key:"Home"});
expect(document.activeElement).toBe(screen.getByRole("button",{name:"Inserir 😀"}));
fireEvent.keyDown(document.activeElement!,{key:"ArrowRight"});
expect(document.activeElement).toBe(screen.getByRole("button",{name:"Inserir 😃"}));
expect(select).not.toHaveBeenCalled();
fireEvent.click(document.activeElement!);expect(select).toHaveBeenCalledWith("😃");
});
it("X fecha sem escolher e reabrir volta ao começo",()=>{
const close=vi.fn(),select=vi.fn();
const view=render(<ChatEmojiPicker onSelect={select} onClose={close}/>);
fireEvent.click(screen.getByRole("button",{name:"Fechar emojis"}));
expect(close).toHaveBeenCalledOnce();expect(select).not.toHaveBeenCalled();
view.unmount();render(<ChatEmojiPicker onSelect={select} onClose={close}/>);
expect(screen.getByRole("button",{name:"Inserir 😀"})).toBeTruthy();
});
});
