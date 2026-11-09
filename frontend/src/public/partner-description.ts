/** Small, Unicode-safe previews for equal-size directory cards. */
export function shortPartnerDescription(value: string, limit = 160): { text: string; truncated: boolean } {
 const normalized = String(value ?? '').trim();
 const chars = Array.from(normalized);
 if(chars.length <= limit) return {text:normalized,truncated:false};
 const first = chars.slice(0,limit).join('');
 const lastSpace = first.lastIndexOf(' ');
 const cut = lastSpace > Math.floor(limit*.6) ? first.slice(0,lastSpace) : first;
 return {text:cut.trimEnd()+'…',truncated:true};
}
