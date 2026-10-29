import {contentHashOf} from "@/domain/memory/canonicalize";
import {importSource} from "@/import/import-source";
import type { ReactElement } from "react";
import {Column,ColumnLayouts,Document,Email,Page,Paragraph,Heading,Row,Table,Html} from "@unlayer/react-elements";
import type {MemoryDocument} from "@/domain/memory/schema";
import type {OutputMode} from "@/domain/memory/types";
import {visualReading, type SourceSpan} from "@/visuals/evidence";
import type {PublishTheme} from "./themes";
import type {BuiltRoot} from "./build-root";
import {escapeHtml,inlineLink} from "./safe-inline";

/** Purpose-built compositions, only for source-backed shapes. Unknowns keep the ordinary renderer. */
const verifiedContexts = new WeakMap<MemoryDocument, {source:string;hash:string;valid:boolean}>();
export function buildInsightRoot(doc:MemoryDocument,mode:OutputMode,theme:PublishTheme,source:string):BuiltRoot|null {
 const reading=visualReading(doc,source);
 const research=doc.archetype?.id==="research"&&doc.blocks.some(b=>b.kind==="signals"&&"entries"in b.payload&&b.payload.entries.some(e=>"claimKind"in e&&e.claimKind==="hypothesis"));
 if(reading.kind==="evidence"&&!research)return null;
 const hash=contentHashOf(doc); const cached=verifiedContexts.get(doc);
 let valid=cached?.source===source&&cached.hash===hash?cached.valid:undefined;
 if(valid===undefined){const verified=importSource({raw:source,label:doc.sourceLabel});valid=verified.ok&&verified.value.contentHash===hash;verifiedContexts.set(doc,{source,hash,valid});}
 if(!valid)return null;
 const c=theme.colors; const email=mode==="email"; const side=email?24:40;
 const rows:ReactElement[]=[]; const proof: {label:string;span:SourceSpan}[]=[];
 const p=(text:string,size=15,color=c.ink)=> <Paragraph html={escapeHtml(text)} fontFamily={theme.fonts.sans} fontSize={`${size}px`} color={color} lineHeight="170%"/>;
 const band=(key:string,label:string,title:string,body:string,bg=c.surface2)=> <Row key={key} layout={ColumnLayouts.OneColumn} backgroundColor={bg} padding={`24px ${side}px`}><Column>{p(label.toUpperCase(),10,c.ink2)}<Heading headingType="h2" fontFamily={theme.fonts.serif} fontSize={email?"25px":"30px"} color={c.ink} lineHeight="125%">{escapeHtml(title)}</Heading>{body?p(body):null}</Column></Row>;
 const evidence=(label:string,span:SourceSpan)=> {const i=proof.push({label,span});return <Paragraph html={inlineLink(mode==="web"?"#inspect-source":`#proof-${i}`,`View source passage ${i}`,c.accent)} fontFamily={theme.fonts.sans} fontSize="12px" lineHeight="160%"/>;};
 const logoSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="66" height="25" viewBox="0 0 54 22" aria-label="memoRABLE mark">${[3,2,1,3,1,2,3].map((h,col)=>Array.from({length:h},(_,row)=>`<rect x="${col*8}" y="${row*8}" width="6" height="6" rx="1.5" fill="${col===3&&row===0?"#1E3BD6":"#14130F"}"/>`).join("")).join("")}</svg>`;
 rows.push(<Row key="identity" layout={ColumnLayouts.OneColumn} padding={`24px ${side}px 18px`} backgroundColor={c.surface}><Column>{!email?<Html html={logoSvg}/>:null}{p("memoRABLE",16,c.ink)}{p("SOURCE EDITION / READ. SEE. REMEMBER.",9,c.ink2)}</Column></Row>);

 if(reading.kind==="comparison"){
  rows.push(band("invoice-title","Invoice",doc.title,"",c.surface));
  const sum=reading.rows.reduce((a,b)=>a+b.value,0); const money=(v:number)=>reading.currency+v.toLocaleString("en-US");
  rows.push(band("hero","Invoice / reconciled from source",money(sum),`${reading.rows.length} line items. One stated amount due.`,c.surface2));
  rows.push(<Row key="total-proof" layout={ColumnLayouts.OneColumn} backgroundColor={c.surface2} padding={`0px ${side}px 20px`}><Column>{p(reading.summary.quote,15)}{p(`${reading.currency} as written. Currency code is not specified. Subtotal and amount due are not extra items.`,11,c.ink2)}{evidence("Amount due",reading.summary)}</Column></Row>);
  rows.push(<Row key="stacked-ledger" layout={ColumnLayouts.OneColumn} padding={`0px ${side}px 24px`} backgroundColor={c.surface2}><Column><Table values={{table:{headers:[],rows:[{height:0,cells:reading.rows.map((r,i)=>({width:r.value/sum*100,text:escapeHtml(money(r.value)),padding:"16px 8px",color:"#ffffff",backgroundColor:i%2?"#80958a":"#234c39"}))}],footers:[]}} as never}/></Column></Row>);

  rows.push(<Row key="ledger" layout={ColumnLayouts.OneColumn} padding={`16px ${side}px 28px`} backgroundColor={c.surface}><Column><Table values={{enableHeader:true,table:{headers:[{height:0,cells:["Item","Amount","Evidence"].map(text=>({text,width:0,padding:"12px",color:c.ink2,backgroundColor:c.surface2}))}],rows:reading.rows.map(r=>{const n=proof.push({label:r.label,span:r.span});return {height:0,cells:[{text:escapeHtml(r.label),padding:"16px 12px",width:0},{text:escapeHtml(money(r.value)),padding:"16px 12px",width:0},{text:inlineLink(mode==="web"?"#inspect-source":`#proof-${n}`,`Passage ${n}`,c.accent),padding:"16px 12px",width:0}]};}),footers:[]}} as never}/>{p("The bar shows item amounts as shares of the stated total. Calculated from the quoted amounts.",11,c.ink2)}</Column></Row>);

 }else if(reading.kind==="dependency"){
  rows.push(band("hero","Dependency / explicitly stated",reading.title,"A prerequisite is a relationship, not a date.",c.surface2));
  rows.push(<Row key="map" layout={ColumnLayouts.OneColumn} padding={`16px ${side}px 26px`} backgroundColor={c.surface2}><Column><Table values={{table:{headers:[],rows:[{height:0,cells:[{text:escapeHtml(reading.before),padding:"20px",backgroundColor:c.surface,width:0}]},{height:0,cells:[{text:"↓  BLOCKS - AS STATED",padding:"14px",color:c.accent,width:0}]},{height:0,cells:[{text:escapeHtml(reading.after),padding:"20px",backgroundColor:c.surface,width:0}]}],footers:[]}} as never}/>{evidence("Phase dependency",reading.span)}</Column></Row>);
  const timelineSection=/^#{1,6}\s+Timeline\s*$([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/im.exec(source);
  if(timelineSection){const extra=timelineSection[1]!.split("\n").filter(l=>/^[-*]\s+Phase \d+:/.test(l)&&!reading.span.quote.includes(l));for(const [i,line]of extra.entries()){const n=source.indexOf(line);const block=doc.blocks.find(b=>b.kind==="timeline");const match=block&&"entries"in block.payload&&block.payload.entries.some(e=>"title"in e&&line.includes(e.title));if(match)rows.push(<Row key={`unlinked-${i}`} layout={ColumnLayouts.OneColumn} padding={`10px ${side}px`}><Column>{p("SEPARATE PHASE / NO EDGE ESTABLISHED",10,c.ink2)}{p(line.replace(/^[-*]\s+/,""),15)}{evidence("Separate phase",{start:n,end:n+line.length,quote:line})}</Column></Row>);}}
  const decisions=doc.blocks.find(b=>b.kind==="decisions");
  const decisionLine=source.split("\n").find(l=>/^[-*]\s+D-\d+(?:\s|:)/.test(l)&&/re-approval/i.test(l)&&decisions&&"entries"in decisions.payload&&decisions.payload.entries.some(e=>"text"in e&&l.includes(e.text)));if(decisionLine){const n=source.indexOf(decisionLine);rows.push(<Row key="decision" layout={ColumnLayouts.OneColumn} padding={`22px ${side}px`} backgroundColor={c.surface2}><Column>{p("DECISION / AS STATED",10,c.ink2)}{p(decisionLine.replace(/^[-*]\s+/,""),18)}{evidence("Decision",{start:n,end:n+decisionLine.length,quote:decisionLine})}</Column></Row>);}
  const risks=doc.blocks.find(b=>b.kind==="risks");if(risks&&"entries"in risks.payload){const entries=risks.payload.entries.filter(e=>"risk"in e);if(entries.length)rows.push(<Row key="risks" layout={ColumnLayouts.OneColumn} padding={`20px ${side}px`}><Column>{p("WHAT COULD BREAK",10,c.ink2)}<Table values={{enableHeader:true,table:{headers:[{height:0,cells:["Risk / mitigation","Source-stated severity"].map(text=>({text,padding:"12px",color:c.paper,backgroundColor:c.ink,width:0}))}],rows:entries.map(e=>({height:0,cells:[escapeHtml(e.risk + ("mitigation"in e&&e.mitigation?` / Mitigation: ${e.mitigation}`:"")),escapeHtml("severity"in e?String(e.severity??"Not stated"):"Not stated")].map(text=>({text,padding:"12px",width:0}))})),footers:[]}} as never}/></Column></Row>);}
 }else{
  const spans=reading.spans; const hypothesis=spans.find(s=>/^hypothesis$/i.test(s.label));const results=spans.filter(s=>/^results$/i.test(s.label));const limitations=spans.filter(s=>/^limitations$/i.test(s.label));
  if(!hypothesis||!results.length)return null;
  rows.push(band("title","Research / claim, evidence, scope",doc.title,"Different claims need different kinds of confidence.",c.surface));
  rows.push(band("hypothesis","01 / hypothesis - under test",hypothesis.span.quote,"This is the proposed claim, not an observed measurement.",c.surface2));
  rows.push(<Row key="hyp-proof" layout={ColumnLayouts.OneColumn} padding={`0px ${side}px 16px`} backgroundColor={c.surface2}><Column>{evidence("Hypothesis",hypothesis.span)}</Column></Row>);
  for(const [i,r]of results.entries()){
   const signals=doc.blocks.find(b=>b.kind==="signals");
   const metric=signals&&"entries"in signals.payload?signals.payload.entries.find(e=>"value"in e&&"implication"in e&&typeof e.implication==="string"&&r.span.quote.includes(e.implication)&&String(e.value).endsWith("%")):undefined;
   rows.push(<Row key={`result-${i}`} layout={ColumnLayouts.OneColumn} padding={`28px ${side}px`} backgroundColor={c.surface}><Column>{p("02 / STATED IN RESULTS",10,c.accent)}{metric&&"value"in metric?<Heading headingType="h2" fontFamily={theme.fonts.serif} fontSize={email?"60px":"80px"} color={c.ink} lineHeight="115%">{escapeHtml(String(metric.value))}</Heading>:null}{metric&&"label"in metric?p(/reduced average inference time by/i.test(r.span.quote)?"Lower average inference time - stated result":metric.label,16,c.ink2):null}<Heading headingType="h3" fontFamily={theme.fonts.serif} fontSize={email?"22px":"28px"} color={c.ink} lineHeight="145%">{escapeHtml(r.span.quote)}</Heading>{evidence("Results",r.span)}</Column></Row>);
  }

  for(const [i,l]of limitations.entries())rows.push(<Row key={`scope-${i}`} layout={ColumnLayouts.OneColumn} padding={`22px ${side}px`} backgroundColor={c.surface2}><Column>{p("03 / SCOPE OF THESE CLAIMS",10,c.ink2)}{p(l.span.quote,15)}{evidence("Limitations",l.span)}</Column></Row>);
 }
 // Email: compact cited passages. Print: one source appendix. Web: one collapsed source.
 if(mode==="web"){
  const highlighted=proof.reduce((a,x)=>a.some(y=>y.start===x.span.start&&y.end===x.span.end)?a:[...a,x.span],[] as SourceSpan[]).sort((a,b)=>a.start-b.start);
  let offset=0;let html="";
  for(const span of highlighted){if(span.start<offset)continue;html+=escapeHtml(source.slice(offset,span.start));html+=`<mark>${escapeHtml(span.quote)}</mark>`;offset=span.end;}
  html+=escapeHtml(source.slice(offset));
  rows.push(<Row key="inspect" anchor="inspect-source" layout={ColumnLayouts.OneColumn} padding={`20px ${side}px`}><Column><Html html={`<details id="source-inspector"><summary style="cursor:pointer;font:16px Arial;padding:16px 0">Inspect source / highlighted passages</summary><p style="font:12px Arial">Exact imported text. Highlights support the brief; other passages remain visible.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 Arial">${html}</pre></details>`}/></Column></Row>);
 }else{
  rows.push(band("proof-title",email?"Source passages":"Source appendix",email?"Check the passages":"Original, with context",email?"Selected source-backed brief. Exact cited passages follow; this is not the full document.":"Complete imported text. Selected span ranges are indexed below; no PDF byte offsets implied.",c.surface));
  if(email){for(const [i,x]of proof.entries())rows.push(<Row key={`proof-${i}`} anchor={`proof-${i+1}`} layout={ColumnLayouts.OneColumn} padding={`10px ${side}px`} backgroundColor={c.surface}><Column>{p(`${i+1} / ${x.label} / source text ${x.span.start}-${x.span.end}`,10,c.ink2)}{p(x.span.quote,12)}</Column></Row>);}
  else {
   const ordered=proof.map((x,i)=>({...x,index:i+1})).sort((a,b)=>a.span.start-b.span.start);let offset=0;let html="";
   for(const x of ordered){if(x.span.start<offset)continue;html+=escapeHtml(source.slice(offset,x.span.start));html+=`<a name="proof-${x.index}"></a><b>[${x.index}]</b> ${escapeHtml(x.span.quote)}`;offset=x.span.end;}
   html+=escapeHtml(source.slice(offset));
   rows.push(<Row key="complete-source" anchor="complete-source" layout={ColumnLayouts.OneColumn} padding={`18px ${side}px`} backgroundColor={c.surface2}><Column>{p(proof.map((x,i)=>`${i+1}. ${x.label}: ${x.span.start}-${x.span.end}`).join(" / "),10,c.ink2)}<Html html={`<pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.75 Arial">${html}</pre>`}/></Column></Row>);
  }

 }
 const common={backgroundColor:c.paper,contentWidth:(email?"600px":mode==="document"?"760px":"860px") as `${number}px`,fontFamily:theme.fonts.sans,textColor:c.ink};
 const root=mode==="email"?<Email {...common} previewText={doc.title}>{rows}</Email>:mode==="document"?<Document {...common}>{rows}</Document>:<Page {...common}>{rows}</Page>;
 return{mode,root,blocks:doc.blocks.map(b=>({blockId:b.id,kind:b.kind,rows:[],recovered:false}))};
}
