import type {CSSProperties} from "react";

// One visible emoji may contain a modifier, joiners, flag indicators or variation selectors.
function emojiPattern() {
  try{return new RegExp("(?:[\\u{1F1E6}-\\u{1F1FF}]{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?[\\u{1F3FB}-\\u{1F3FF}]?(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?(?:\\u200D\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?[\\u{1F3FB}-\\u{1F3FF}]?(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?)*)","gu");}
  catch{return new RegExp("(?:[\\u{1F1E6}-\\u{1F1FF}]{2}|[0-9#*]\\uFE0F?\\u20E3|[\\u00A9\\u00AE\\u203C\\u2049\\u2122\\u2139\\u2190-\\u27FF\\u2B00-\\u2BFF\\u3030\\u303D\\u3297\\u3299\\u{1F000}-\\u{1FAFF}][\\uFE0E\\uFE0F]?[\\u{1F3FB}-\\u{1F3FF}]?(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?(?:\\u200D[\\u00A9\\u00AE\\u203C\\u2049\\u2122\\u2139\\u2190-\\u27FF\\u2B00-\\u2BFF\\u3030\\u303D\\u3297\\u3299\\u{1F000}-\\u{1FAFF}][\\uFE0E\\uFE0F]?[\\u{1F3FB}-\\u{1F3FF}]?(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?)*)","gu");}
}
const EMOJI_PATTERN=emojiPattern();
export function chatEmojiTextStyle(text:string):CSSProperties|undefined {
  const compact=text.replace(/\s/g,"");
  if(!compact)return undefined;
  const parts=compact.match(EMOJI_PATTERN);
  if(!parts || parts.join("")!==compact)return undefined;
  return {fontSize:parts.length===1?48:32,lineHeight:1.25};
}
