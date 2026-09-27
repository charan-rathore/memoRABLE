import type { MemoryDocument } from '@/domain/memory/schema';
import { contentTokens, splitSentences } from './language';

/** Evidence remains local and exact: no completion from a model or outside text. */
export interface SourceSpan { page: number | null; line: number; start: number; end: number; quote: string }
export interface EvidenceInsight {
  kind: 'stated' | 'inferred';
  title: string;
  claim: string;
  premises: SourceSpan[];
  /** A missing value is not a safe inference. */
  rule: 'exact' | 'difference' | 'scope-gap' | 'target-gap' | 'tradeoff' | 'mixed-metrics';
}
export interface EvidenceReport { takeaways: EvidenceInsight[]; hidden: EvidenceInsight[]; rejected: string[] }

const PAGE=/^<!--\s*page:(\d+)\s*-->$/i;
const DATA=/(?:[€$]\s*\d+(?:[,.]\d+)?(?:[kmb])?|\d+(?:\.\d+)?\s*(?:%|percent|minutes?|hours?|days?|ms|seconds?|teams?|participants?))/i;
const CHANGE=/\b(?:from|down from)\s+(\d+(?:\.\d+)?)\s*(%|percent|minutes?|hours?|days?|ms|seconds?|teams?)\s+to\s+(\d+(?:\.\d+)?)\s*(%|percent|minutes?|hours?|days?|ms|seconds?|teams?)/i;
const BEFORE_AFTER=/\b(?:from|down from)\s+(\d+(?:\.\d+)?)\s*(%|percent|minutes?|hours?|days?|ms|seconds?|teams?)\s+(?:to|now)\s+(\d+(?:\.\d+)?)\s*(%|percent|minutes?|hours?|days?|ms|seconds?|teams?)/i;
const NO_TEST=/\b(?:did not|does not|not|never)\s+(?:measure|test|evaluate|assess|study|verify|include|establish)\b/i;
const NO_PROOF=/\b(?:do|does|did) not establish\b/i;
const NEGATIVE_STATUS=/\b(?:did not|does not|not from|not a|no offer|no automatic|nothing has been)\b/i;
const PENDING=/\b(?:pending|not yet|has not|have not|(?:has|have) not been|no .*?(?:chosen|approved|awarded|booked|reproduced))\b/i;
const UNAWARDED=/\b(?:has|have) not been (?:awarded|approved|booked|chosen|reproduced)\b/i;
const RISK=/\b(?:risk|may delay|could hurt|would miss|bottleneck|failure|blocked)\b/i;
const NEGATION=/\b(?:no|not|never|without|none|cannot|can't|didn't|wasn't|weren't)\b/i;
const MODAL=/\b(?:could|might|maybe|suggested|pending|if|proposed|considered)\b/i;
const FINISHED=/\b(?:restored|resolved|completed|approved|shipped)\b/i;
const NOTE=/^\s*(?:from|to|subject|attendees|general note)\s*:/i;
const PURPOSE=/\b(?:pilot|goal|target|policy|fee|revenue|margin|conversion|completion|risk|pending|approved|lost|chosen|reproduced|sensor|audit|sample|applications|interview|receipt|not awarded|offer|attachment)\b/i;
const TARGET_GAP=/\b(\d+(?:\.\d+)?)\s*%\s*,?\s*below\s+(?:the\s+)?(\d+(?:\.\d+)?)\s*%\s+target\b/i;
const REVENUE_UP=/^\s*(?:[-*]\s*)?Revenue:\s*[^\n]*?\bup\s+(\d+(?:\.\d+)?)\s*%\s+year on year\b/i;
const MARGIN_DOWN=/^\s*(?:[-*]\s*)?Gross margin:\s*(\d+(?:\.\d+)?)\s*%\s*,?\s*down from\s*(\d+(?:\.\d+)?)\s*%/i;

/** Preserve original offsets in each line, including repeated substrings. */
export function sourceSpans(raw: string): SourceSpan[] {
  const out: SourceSpan[]=[];let page: number|null=null;
  raw.split('\n').forEach((line,i)=>{
    const marker=PAGE.exec(line.trim());if(marker){page=Number(marker[1]);return;}
    if(!line.trim() || /^\s*#{1,6}\s/.test(line) || /^\s*\|\s*[-:| ]+\|\s*$/.test(line))return;
    const body=line.replace(/^\s*[-*]\s+/,'');
    let cursor=0;
    for(const piece of splitSentences(body)){
      const start=line.indexOf(piece,cursor);if(start<0)continue;
      cursor=start+piece.length;
      const quote=line.slice(start,cursor);
      if(quote.trim().length>=10)out.push({page,line:i+1,start,end:cursor,quote});
    }
  });
  return out;
}
function uniqueWords(text:string):Set<string>{return new Set(contentTokens(text).filter(t=>t.length>3))}
function agreement(candidate:string,quote:string):number{
  const a=uniqueWords(candidate),b=uniqueWords(quote);
  if(a.size===0)return 0;
  let count=0;for(const t of a)if(b.has(t))count++;
  return count/a.size;
}
function verifiable(candidate:string,span:SourceSpan):boolean{
  // Never infer a number or named negation from a merely similar sentence.
  const nums=candidate.match(/(?:\$|€)?\d+(?:\.\d+)?%?/g)??[];
  if(nums.some(n=>!span.quote.includes(n)))return false;
  if(NEGATION.test(candidate)!==NEGATION.test(span.quote))return false;
  if(MODAL.test(candidate)!==MODAL.test(span.quote))return false;
  return agreement(candidate,span.quote)>=0.75;
}
function scored(raw:string){return sourceSpans(raw).map(span=>{
  const q=span.quote;
  // A table row without its header is not a statement. Keep exact rows in
  // source notes; a typed, header-aware comparison is handled separately.
  if (/^\s*\|.*\|\s*$/.test(q)) return {span,score:0};
  const score=(DATA.test(q)?4:0)+(RISK.test(q)?3:0)+(NO_TEST.test(q)||NO_PROOF.test(q)||NEGATIVE_STATUS.test(q)||PENDING.test(q)||UNAWARDED.test(q)?4:0)+(FINISHED.test(q)?2:0)+(/\b(?:must|shall|approved|decided|need to|will)\b/i.test(q)?2:0)+(PURPOSE.test(q)?1:0);
  return {span,score};
 }).filter(x=>x.score>0&&!NOTE.test(x.span.quote)).sort((a,b)=>b.score-a.score||a.span.line-b.span.line)}
function supportedClaims(doc:MemoryDocument,spans:SourceSpan[]):EvidenceInsight[]{
  const out:EvidenceInsight[]=[];
  for(const block of doc.blocks){
    if(!('entries'in block.payload))continue;
    for(const entry of block.payload.entries){
      const typed=entry as {label?:string;value?:string|number;text?:string;risk?:string;task?:string;title?:string};
      const claim=typed.text??typed.risk??typed.task??typed.title??[typed.label,typed.value].filter(Boolean).join(': ');
      if(!claim||claim.length<12)continue;
      const matched=spans.find(s=>verifiable(claim,s));
      if(matched&&matched.quote.toLowerCase().includes(claim.toLowerCase()))out.push({kind:'stated',title:block.title,claim,premises:[matched],rule:'exact'});
    }
  }
  return out;
}
/** Safe local insights: numeric movement and explicit unmeasured scopes only. */
export function buildEvidenceReport(raw:string,doc:MemoryDocument):EvidenceReport{
  const spans=sourceSpans(raw),ranked=scored(raw);
  const takeaways:EvidenceInsight[]=[];
  for(const {span}of ranked){
    if(takeaways.length>=5)break;
    if(takeaways.some(x=>x.premises[0]?.line===span.line&&x.premises[0]?.start===span.start))continue;
    takeaways.push({kind:'stated',title:(NO_TEST.test(span.quote)||NO_PROOF.test(span.quote))?'Not established':(PENDING.test(span.quote)||UNAWARDED.test(span.quote))?'Still open':RISK.test(span.quote)?'Watchout':'Key fact',claim:span.quote,premises:[span],rule:'exact'});
  }
  const hidden:EvidenceInsight[]=[];
  for(const span of spans){
    const m=BEFORE_AFTER.exec(span.quote)??CHANGE.exec(span.quote);
    if(m&&m[2]&&m[4]&&m[2].toLowerCase()===m[4].toLowerCase()){
      const a=Number(m[1]),b=Number(m[3]),diff=b-a;
      if(Number.isFinite(diff)&&a!==b){
        const unit=m[2].toLowerCase();
        hidden.push({kind:'inferred',title:diff>0?'Increase':'Decrease',claim:`${Math.abs(diff).toFixed(1).replace(/\.0$/,'')} ${unit==='%'?'percentage points':unit} ${diff>0?'higher':'lower'} (${a}${unit==='%'?'%':` ${unit}`} to ${b}${unit==='%'?'%':` ${unit}`}).`,premises:[span],rule:'difference'});
      }
    }
    const target=TARGET_GAP.exec(span.quote);
    if(target){const a=Number(target[1]),b=Number(target[2]);if(Number.isFinite(a)&&Number.isFinite(b)&&a<b)hidden.push({kind:'inferred',title:'Target gap',claim:`${Number((b-a).toFixed(2))} percentage points below target (${a}% vs ${b}%).`,premises:[span],rule:'target-gap'})}
    if(NO_TEST.test(span.quote)||NO_PROOF.test(span.quote))hidden.push({kind:'stated',title:'Evidence limit',claim:span.quote,premises:[span],rule:'scope-gap'});
  }
  // A comparison needs both rows, explicit table headings, and identical units.
  const rows=spans.filter(s=>/^\s*\|[^|]+\|[^|]+\|[^|]+\|\s*$/.test(s.quote));
  const sourceLines=raw.split('\n');
  const header=sourceLines.findIndex(l=>/^\s*\|\s*(?:Bidder|Vendor)\s*\|\s*Price\s*\|\s*Delivery\s*\|\s*$/i.test(l));
  if(header>=0&&rows.length>=2){
    const read=(s:SourceSpan)=>/^\s*\|\s*([^|]+)\|\s*\$([\d,]+)\s*\|\s*(\d+)\s*days?\s*\|\s*$/i.exec(s.quote);
    const a=rows.find(s=>s.line>header+1&&read(s));
    const b=a&&rows.find(s=>s.line>a.line&&read(s));
    if(a&&b){const aa=read(a)!,bb=read(b)!,pa=Number(aa[2]!.replace(/,/g,'')),pb=Number(bb[2]!.replace(/,/g,'')),da=Number(aa[3]),db=Number(bb[3]);if(Number.isFinite(pa)&&Number.isFinite(pb)&&Number.isFinite(da)&&Number.isFinite(db)&&pa!==pb&&da!==db){
      const cheaper=pa<pb?aa:bb,faster=da<db?aa:bb,priceGap=Math.abs(pa-pb),dayGap=Math.abs(da-db);
      hidden.push({kind:'inferred',title:'Cost versus speed',claim:`${cheaper[1]!.trim()} costs $${priceGap.toLocaleString('en-US')} less; ${faster[1]!.trim()} delivers ${dayGap} ${dayGap===1?'day':'days'} sooner. Neither is automatically better.`,premises:[a,b],rule:'tradeoff'});
    }}
  }
  const revenue=spans.find(x=>REVENUE_UP.test(x.quote));
  const margin=spans.find(x=>MARGIN_DOWN.test(x.quote));
  if(revenue&&margin){const rise=Number(REVENUE_UP.exec(revenue.quote)?.[1]),now=Number(MARGIN_DOWN.exec(margin.quote)?.[1]),before=Number(MARGIN_DOWN.exec(margin.quote)?.[2]);
    if(Number.isFinite(rise)&&Number.isFinite(now)&&Number.isFinite(before)&&rise>0&&before>now)hidden.push({kind:'inferred',title:'Growth and margin diverge',claim:`Revenue rose ${rise}% year on year while gross margin fell ${Number((before-now).toFixed(2))} percentage points (${before}% to ${now}%).`,premises:[revenue,margin],rule:'mixed-metrics'});
  }
  // A scope gap already present in the takeaway is not a second insight.
  const takeawayLines=new Set(takeaways.flatMap(x=>x.premises.map(p=>`${p.line}:${p.start}`)));
  for(let i=hidden.length-1;i>=0;i--)if(hidden[i]?.rule==='scope-gap'&&takeawayLines.has(`${hidden[i]!.premises[0]!.line}:${hidden[i]!.premises[0]!.start}`))hidden.splice(i,1);
  const validated=supportedClaims(doc,spans);
  for(const claim of validated){if(takeaways.length>=5)break;if(!takeaways.some(x=>x.premises[0]?.line===claim.premises[0]?.line&&x.premises[0]?.start===claim.premises[0]?.start))takeaways.push(claim)}
  return {takeaways,hidden:hidden.slice(0,3),rejected:[]};
}
