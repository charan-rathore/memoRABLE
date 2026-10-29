import type { MemoryDocument } from "@/domain/memory/schema";

/** Offsets index the exact imported JS string (UTF-16 code units), never PDF bytes. */
export interface SourceSpan { start: number; end: number; quote: string }
export type VisualReading =
 | { kind: "comparison"; title: string; rows: { label: string; value: number; span: SourceSpan }[]; summary: SourceSpan; currency: string; context: SourceSpan[] }
 | { kind: "dependency"; title: string; before: string; after: string; span: SourceSpan }
 | { kind: "evidence"; title: string; reason: string; spans: { label: string; span: SourceSpan }[] };
function linesOf(source: string) {
 const lines: {text:string; start:number; end:number}[]=[];
 const re=/[^\r\n]+/g; let m:RegExpExecArray|null;
 while((m=re.exec(source))) lines.push({text:m[0],start:m.index,end:m.index+m[0].length});
 return lines;
}
function span(line:{text:string;start:number;end:number}):SourceSpan{return {start:line.start,end:line.end,quote:line.text};}
export function validSpan(source:string, ref:SourceSpan):boolean {
 return Number.isInteger(ref.start)&&Number.isInteger(ref.end)&&ref.start>=0&&ref.end>ref.start&&source.slice(ref.start,ref.end)===ref.quote;
}
/** Deliberately narrow sidecar: no parser/schema mutation and no arbitrary graph edges. */
export function visualReading(doc:MemoryDocument, source:string):VisualReading {
 const lines=linesOf(source);
 if(doc.archetype?.id==="invoice") {
  // Complete line-item section, not guessed numeric mentions or summary totals.
  const h=lines.findIndex(l=>/^#{1,6}\s+Line items\s*$/i.test(l.text));
  if(h>=0){
   const rows: {label:string;value:number;span:SourceSpan}[]=[]; let currency=""; let invalid=false;
   for(const line of lines.slice(h+1)) {
    if(/^#{1,6}\s/.test(line.text)||/^(Subtotal|Amount due|Total|Tax|Discount)\s*:/i.test(line.text)) break;
    if(!line.text.trim())continue;
    const m=/^[-*]\s+(.+?)\s+[—–-]\s+([$€£])([\d,]+(?:\.\d{2})?)\s*$/.exec(line.text);
    if(!m){invalid=true;break;}
    const value=Number(m[3]!.replace(/,/g,""));
    if(!Number.isFinite(value)||value<0||(currency&&currency!==m[2])||/subtotal|amount due|total/i.test(m[1]!)){invalid=true;break;}
    currency=m[2]!; rows.push({label:m[1]!,value,span:span(line)});
   }
   const totals=lines.filter(l=>/^Amount due:\s*([$€£])[\d,.]+\s*$/i.test(l.text));
   if(!invalid&&rows.length>=2&&rows.length<=8&&totals.length===1){
    const m=/^Amount due:\s*([$€£])([\d,.]+)\s*$/i.exec(totals[0]!.text)!;
    const sum=rows.reduce((n,r)=>n+r.value,0),total=Number(m[2]!.replace(/,/g,""));
    const matching=doc.blocks.some(b=>{ if(b.kind!=="signals"||!("entries"in b.payload)) return false; const entries=b.payload.entries; return rows.every(r=>entries.some(e=>"label"in e&&e.label===r.label&&"financialRole"in e&&e.financialRole==="line-item"&&"value"in e&&typeof e.value==="string"&&e.value.startsWith(currency)&&/^[$€£][\d,]+(?:\.\d{2})?$/.test(e.value)&&Number(e.value.slice(1).replace(/,/g,""))===r.value)); });
    if(currency===m[1]&&sum>0&&Math.abs(sum-total)<0.005&&matching)return {kind:"comparison",title:"Line items reconcile with the stated amount due.",rows,summary:span(totals[0]!),currency,context:lines.filter(l=>/\b(?:currency|amounts?\s+(?:are\s+)?in|USD|CAD|AUD|NZD|SGD|HKD|EUR|GBP|INR|JPY)\b/i.test(l.text)).map(span)};
   }
  }
 }
 // Only the source's literal numbered-phase dependency, not inferred relations.
 let inTimeline=false; let timelineStart=0; let timelineEnd=source.length;
 for(const line of lines){
  const heading=/^#{1,6}\s+(.+)$/.exec(line.text);
  if(heading){inTimeline=/^timeline$/i.test(heading[1]!.trim());timelineStart=line.end;const next=lines.find(l=>l.start>line.start&&/^#{1,6}\s/.test(l.text));timelineEnd=next?.start??source.length;continue;}
  if(!inTimeline)continue;
  const m=/^[-*]\s+Phase (\d+): (.+?)\s+[—–-]\s+planned \(blocked by Phase (\d+)\)\s*$/i.exec(line.text);
  if(!m)continue;
  const prior=lines.filter(l=>l.start>=timelineStart&&l.end<=timelineEnd&&new RegExp(`^[-*]\\s+Phase ${m[3]}: (.+?)\\s+[—–-]\\s+planned\\s*$`,"i").test(l.text));
  const current=lines.filter(l=>l.start>=timelineStart&&l.end<=timelineEnd&&new RegExp(`^[-*]\\s+Phase ${m[1]}:`).test(l.text));
  if(prior.length!==1||current.length!==1||m[1]===m[3])continue;
  const first=prior[0]!;
  if(first.start>=line.start)continue;
  return {kind:"dependency",title:`Phase ${m[3]} blocks Phase ${m[1]}, as stated.`,before:first.text.replace(/^[-*]\s+/,""),after:line.text.replace(/^[-*]\s+/,""),span:{start:first.start,end:line.end,quote:source.slice(first.start,line.end)}};
 }
 const selected:{label:string;span:SourceSpan}[]=[];let heading="Source";
 for(const line of lines){const m=/^#{1,6}\s+(.+)$/.exec(line.text);if(m){heading=m[1]!;continue;}if(/^(Hypothesis|Results|Limitations)$/i.test(heading)&&line.text.trim())selected.push({label:heading,span:span(line)});}
 if(!selected.length){const l=lines.find(l=>!/^#/.test(l.text)&&l.text.trim());if(l)selected.push({label:"Source excerpt",span:span(l)});}
 return {kind:"evidence",title:"Keep the source's claims in context.",reason:"No comparable measurement set or explicit supported dependency was established. No chart or inferred relationship was added.",spans:selected};
}
