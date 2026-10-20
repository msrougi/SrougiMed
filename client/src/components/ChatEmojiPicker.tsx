import {memo,useLayoutEffect,useRef,useState,type KeyboardEvent} from "react";
import {X} from "lucide-react";
import {Button} from "./ui/button";

// Text glyphs only; no image library, downloads, or rebuilding this catalogue per render.
export const CHAT_EMOJIS:readonly string[]=["😀","😃","😄","😁","😆","😅","😂","🤣","😊","🙂","🙃","😉","😍","🥰","😘","😗","😚","😙","🤩","🥳","😎","🤓","🧐","🤔","🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","😮","😯","😲","😳","🥺","🥹","😢","😭","😤","😠","😡","🤬","😱","😨","😰","😥","😓","🤗","🤭","🫢","🫣","🤫","🫡","🤥","😴","🥱","😪","🤤","🤯","🥵","🥶","😵","🤪","😜","😝","😛","🫠","🤒","🤕","🤧","🤢","🤮","😷","👋","🤚","✋","🖐️","🖖","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💪","🦾","🫶","✍️","👀","👁️","👂","🧠","🫀","🫁","🦷","🦴","👩‍⚕️","👨‍⚕️","🧑‍⚕️","🧑‍💻","👩‍💻","👨‍💻","👩","👨","🧑","👶","👧","👦","🧒","👵","👴","🧓","👥","🫂","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","🩷","🩵","🩶","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","✅","☑️","✔️","❌","❎","⚠️","🚫","⛔","🛑","❗","❓","❕","❔","‼️","⁉️","ℹ️","🆗","🆘","🆕","🆙","🆒","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","⭐","🌟","✨","💫","🔥","💯","🎉","🎊","🎈","🎁","🎂","🏆","🥇","🎯","💡","🔔","🔕","📣","📢","💬","🗨️","📞","☎️","📱","💻","🖥️","⌨️","🖨️","📷","📸","🎥","🎧","🎤","📅","📆","🗓️","⏰","⏱️","⌛","⏳","🕐","🕑","🕒","🕓","🕔","🕕","🕖","🕗","🕘","🕙","🕚","🕛","📌","📍","📝","📋","📄","📃","📑","📚","📖","📒","📓","✏️","🖊️","📎","🖇️","📁","📂","🗂️","🗃️","🗄️","🗑️","✉️","📩","📤","📥","📦","🔍","🔎","🔒","🔓","🔑","🛡️","⚙️","🛠️","🔧","🔗","🧾","💳","💰","💵","🏥","🏨","🏠","🏢","🚑","🩺","💊","💉","🩹","🩼","🩻","🧪","🧬","🔬","🌡️","🧴","🧼","🧽","🧻","🧤","🥼","🛏️","🪑","🚪","🚶","🏃","🚗","🚕","🚌","🚇","✈️","☀️","🌤️","☁️","🌧️","⛈️","🌈","🌙","🌞","🌻","🌷","🌹","🌸","🌿","🍀","🌳","🐶","🐱","🐼","🦋","🐢","🐝","🐬","🐳","🍎","🍏","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍍","🥑","🥕","🥦","🍞","🧀","🍳","🍽️","🥗","🍲","☕","🍵","🧃","🥤","💧","🧊"];
const COLUMNS=6,ROW_HEIGHT=36,VIEWPORT_HEIGHT=112,OVERSCAN=1;
const ROWS=Math.ceil(CHAT_EMOJIS.length/COLUMNS);
const MAX_SCROLL=Math.max(0,ROWS*ROW_HEIGHT-VIEWPORT_HEIGHT);

const ChatEmojiPicker=memo(function ChatEmojiPicker({onSelect,onClose}:{onSelect:(emoji:string)=>void;onClose:()=>void}) {
  const viewport=useRef<HTMLDivElement>(null);
  const pendingFocus=useRef<number|null>(null);
  const [firstVisible,setFirstVisible]=useState(0);
  const [active,setActive]=useState(0);
  const startRow=Math.max(0,firstVisible-OVERSCAN);
  const endRow=Math.min(ROWS,firstVisible+Math.ceil(VIEWPORT_HEIGHT/ROW_HEIGHT)+OVERSCAN);
  const start=startRow*COLUMNS,end=Math.min(CHAT_EMOJIS.length,endRow*COLUMNS);
  useLayoutEffect(()=>{
    if(pendingFocus.current===null)return;
    const button=viewport.current?.querySelector<HTMLButtonElement>('[data-emoji-index="'+pendingFocus.current+'"]');
    if(button){button.focus({preventScroll:true});pendingFocus.current=null;}
  },[active,firstVisible]);
  function navigate(event:KeyboardEvent<HTMLDivElement>) {
    const node=viewport.current;
    if(!node)return;
    const source=(event.target as HTMLElement).closest<HTMLElement>("[data-emoji-index]");
    const current=source?Number(source.dataset.emojiIndex):active;
    let target:number;
    if(event.key==="ArrowRight")target=current+1;
    else if(event.key==="ArrowLeft")target=current-1;
    else if(event.key==="ArrowDown")target=current+COLUMNS;
    else if(event.key==="ArrowUp")target=current-COLUMNS;
    else if(event.key==="Home")target=0;
    else if(event.key==="End")target=CHAT_EMOJIS.length-1;
    else return;
    event.preventDefault();
    target=Math.max(0,Math.min(CHAT_EMOJIS.length-1,target));
    const top=Math.floor(target/COLUMNS)*ROW_HEIGHT;
    const nextScroll=Math.max(0,Math.min(MAX_SCROLL,top<node.scrollTop?top:top+ROW_HEIGHT>node.scrollTop+VIEWPORT_HEIGHT?top+ROW_HEIGHT-VIEWPORT_HEIGHT:node.scrollTop));
    node.scrollTop=nextScroll;
    pendingFocus.current=target;
    setFirstVisible(Math.floor(nextScroll/ROW_HEIGHT));setActive(target);
    // At an edge React may keep both states; the existing button can be focused directly.
    const button=node.querySelector<HTMLButtonElement>('[data-emoji-index="'+target+'"]');
    if(button){button.focus({preventScroll:true});pendingFocus.current=null;}
  }
  return <div role="group" aria-label="Emojis" style={{height:160}} className="mb-2 flex flex-col rounded-lg border bg-background">
    <div style={{height:40}} className="flex shrink-0 items-center justify-between pl-3 pr-1">
      <span className="text-xs font-medium">Emojis</span>
      <Button type="button" variant="ghost" size="icon" aria-label="Fechar emojis" title="Fechar emojis" onClick={onClose}><X className="h-4 w-4"/></Button>
    </div>
    <span id="chatmed-emoji-help" className="sr-only">Use as setas para escolher, Home e End para ir ao início ou fim, e Enter para inserir.</span>
    <div ref={viewport} tabIndex={0} role="group" aria-label="Lista de emojis" aria-describedby="chatmed-emoji-help"
      style={{height:VIEWPORT_HEIGHT,overflowY:"auto",overscrollBehavior:"contain"}} className="mx-2 shrink-0"
      onKeyDown={navigate} onScroll={event=>setFirstVisible(Math.floor(Math.max(0,Math.min(MAX_SCROLL,event.currentTarget.scrollTop))/ROW_HEIGHT))}>
      <div style={{height:ROWS*ROW_HEIGHT,position:"relative"}}>
        <div style={{position:"absolute",top:startRow*ROW_HEIGHT,left:0,right:0,display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gridAutoRows:ROW_HEIGHT}}>
          {CHAT_EMOJIS.slice(start,end).map((emoji,offset)=>{
            const index=start+offset;
            return <button type="button" key={emoji} data-emoji-index={index} tabIndex={active===index?0:-1}
              aria-label={"Inserir "+emoji} onFocus={()=>setActive(index)} onClick={()=>onSelect(emoji)}
              style={{height:ROW_HEIGHT,fontFamily:'"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',fontSize:22,lineHeight:1}}
              className="rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >{emoji}</button>;
          })}
        </div>
      </div>
    </div>
  </div>;
});
export default ChatEmojiPicker;
