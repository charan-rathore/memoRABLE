"use client";
import { useMemo, useState } from "react";
import type { MemoryDocument } from "@/domain/memory/schema";
import { visualReading, validSpan, type SourceSpan } from "@/visuals/evidence";

export function VisualReadingPanel({document,source}:{document:MemoryDocument;source:string}) {
 const [open,setOpen]=useState(false);
 return <details className="visual-reading" data-testid="visual-reading" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Visual reading <small> · source-backed view</small></summary>{open?<VisualReadingContent document={document} source={source}/>:null}</details>;
}
function VisualReadingContent({document,source}:{document:MemoryDocument;source:string}) {
 const reading=useMemo(()=>visualReading(document,source),[document,source]);
 const [selection,setSelection]=useState<{source:string;span:SourceSpan}|null>(null);
 const selected=selection?.source===source&&validSpan(source,selection.span)?selection.span:null;
 const button=(ref:SourceSpan,label:string)=><button type="button" className="btn" onClick={()=>setSelection({source,span:ref})}>{label}</button>;
 return <section><h2>{reading.title}</h2>
 {reading.kind==="comparison"?<><p>{reading.currency} as written. Symbol-only amounts. Source labels are quoted without resolving currency ambiguity. Summary totals are not extra items.</p>{reading.context.map((s,i)=><p key={i}>{s.quote} {button(s,"Inspect currency context")}</p>)}<table><caption>Source-stated line items</caption><thead><tr><th>Item</th><th>Amount</th><th>Evidence</th></tr></thead><tbody>{reading.rows.map((r,i)=><tr key={i}><td>{r.label}<div className="visual-bar" aria-hidden="true"><i style={{width:`${r.value/Math.max(...reading.rows.map(x=>x.value))*100}%`}}/></div></td><td>{reading.currency}{r.value.toLocaleString("en-US")}</td><td>{button(r.span,`Source ${i+1}`)}</td></tr>)}</tbody></table>{button(reading.summary,"Check amount due")}</>:reading.kind==="dependency"?<><div className="visual-dependency"><p>{reading.before}</p><strong>blocks ↓</strong><p>{reading.after}</p></div>{button(reading.span,"Inspect stated dependency")}</>:<><p>{reading.reason}</p>{reading.spans.map((s,i)=><div className="visual-excerpt" key={i}><strong>{s.label} · source-stated text</strong><blockquote>{s.span.quote}</blockquote>{button(s.span,`Inspect ${s.label}`)}</div>)}</>}
 {selected?<aside aria-label="Selected visual evidence" tabIndex={0}><h3>Exact imported text</h3><p>Text positions {selected.start}–{selected.end}, UTF-16. Not original PDF byte offsets.</p><pre>{source.slice(Math.max(0,selected.start-140),selected.start)}<mark>{source.slice(selected.start,selected.end)}</mark>{source.slice(selected.end,selected.end+140)}</pre></aside>:null}
 </section>;
}
