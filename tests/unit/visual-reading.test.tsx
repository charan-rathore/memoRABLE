// @vitest-environment jsdom
import { describe,it,expect } from "vitest";
import {readFileSync} from "node:fs";
import {render,fireEvent,screen,cleanup} from "@testing-library/react";
import {importSource} from "@/import/import-source";
import {visualReading,validSpan} from "@/visuals/evidence";
import {VisualReadingPanel} from "@/components/preview/visual-reading";
const fixture=(id:string)=>readFileSync(`tests/fixtures/archetypes/${id}.md`,"utf8");
function parse(source:string){const r=importSource({raw:source,label:"fixture.md"});if(!r.ok)throw Error("importfailed");return r.value;}
describe("imported source to eligible visual",()=>{
 it("reconciles invoice line items without summary doublecount",()=>{const s=fixture("invoice"),v=visualReading(parse(s),s);expect(v.kind).toBe("comparison");if(v.kind!=="comparison")return;expect(v.rows).toHaveLength(2);expect(v.rows.reduce((n,r)=>n+r.value,0)).toBe(15500);expect(v.rows.every(r=>validSpan(s,r.span))).toBe(true);expect(validSpan(s,v.summary)).toBe(true);expect(v.currency).toBe("$");});
 it.each([
  ["mismatched total",(s:string)=>s.replace("Amount due: $15,500","Amount due: $16,000")],
  ["mixed currency",(s:string)=>s.replace("$3,500","€3,500")],
  ["unknown row",(s:string)=>s.replace("Subtotal:","- undisclosed charge\nSubtotal:")],
  ["duplicate total",(s:string)=>s+"\nAmount due: $15,500"],
  ["negative row",(s:string)=>s.replace("$3,500","$-3,500")],
  ["nonfinite",(s:string)=>s.replace("$3,500","$Infinity")],
 ])("withholds comparison on %s",(_,change)=>{const s=change(fixture("invoice"));expect(visualReading(parse(s),s).kind).toBe("evidence");});
 it("does not chart source numbers absent from imported canonical items",()=>{const s=fixture("invoice"),doc=parse(s);doc.blocks=doc.blocks.filter(b=>b.kind!=="signals");expect(visualReading(doc,s).kind).toBe("evidence");});
 it("maps only explicit numbered phase dependency, not inferred relations",()=>{const s=fixture("prd"),doc=parse(s);doc.relations=[];const v=visualReading(doc,s);expect(v.kind).toBe("dependency");if(v.kind!=="dependency")return;expect(v.before).toContain("Phase 1");expect(v.after).toContain("Phase 2");expect(validSpan(s,v.span)).toBe(true);});
 it.each([
 ["removed",(s:string)=>s.replace(" (blocked by Phase 1)","")],
 ["negated",(s:string)=>s.replace("(blocked by Phase 1)","(not blocked by Phase 1)")],
 ["conditional",(s:string)=>s.replace("(blocked by Phase 1)","(may be blocked by Phase 1)")],
 ["missing predecessor",(s:string)=>s.replace("- Phase 1: Capture edit history schema — planned","")],
 ["duplicate predecessor",(s:string)=>s.replace("## Risks","- Phase 1: Another phase — planned\n\n## Risks")],
 ["self edge",(s:string)=>s.replace("blocked by Phase 1","blocked by Phase 2")],
 ])("withholds unsupported %s edge",(_,change)=>{const s=change(fixture("prd"));expect(visualReading(parse(s),s).kind).toBe("evidence");});
 it("keeps research hypothesis/results/limits as labeled text, never measured score",()=>{const s=fixture("research"),v=visualReading(parse(s),s);expect(v.kind).toBe("evidence");if(v.kind!=="evidence")return;expect(v.spans.map(r=>r.label)).toEqual(["Hypothesis","Results","Limitations"]);expect(v.spans[0]!.span.quote).toContain("92%");expect(v.spans.every(r=>validSpan(s,r.span))).toBe(true);});
 it("retains exact UTF16 offsets with emoji/CRLF prefix and refuses stale spans",()=>{const s="😀\r\n"+fixture("research").replace(/\n/g,"\r\n"),v=visualReading(parse(s),s);if(v.kind!=="evidence")throw Error("expected evidence");for(const r of v.spans)expect(validSpan(s,r.span)).toBe(true);expect(validSpan("edited"+s,v.spans[0]!.span)).toBe(false);});
 it("does not map literal phase quotes outside Timeline",()=>{const s=fixture("prd").replace("## Timeline","## Rejected proposal");expect(visualReading(parse(s),s).kind).toBe("evidence");});
 it("does not normalize whitespace before span validation",()=>{const s=fixture("research"),v=visualReading(parse(s),s);if(v.kind!=="evidence")throw Error();const r=v.spans[0]!.span;expect(validSpan(s,{...r,start:r.start+1})).toBe(false);});
 it("actual source button highlights exact span and edits clear stale highlight",()=>{const s=fixture("invoice"),doc=parse(s);const {rerender}=render(<VisualReadingPanel document={doc} source={s}/>);(screen.getByTestId("visual-reading") as HTMLDetailsElement).open=true;fireEvent(screen.getByTestId("visual-reading"),new Event("toggle"));fireEvent.click(screen.getByText("Source 1"));expect(document.querySelector("mark")!.textContent).toBe("- Fleet analytics seat licenses × 40 — $12,000");rerender(<VisualReadingPanel document={doc} source={"edited"+s}/>);expect(document.querySelector("mark")).toBeNull();cleanup();});
 it("untrusted labels are text, not executable HTML",()=>{const s=fixture("invoice").replace("Onboarding workshop","<img src=x onerror=alert(1)>");render(<VisualReadingPanel document={parse(s)} source={s}/>);(screen.getByTestId("visual-reading") as HTMLDetailsElement).open=true;fireEvent(screen.getByTestId("visual-reading"),new Event("toggle"));expect(document.querySelector("img")).toBeNull();cleanup();});
});
