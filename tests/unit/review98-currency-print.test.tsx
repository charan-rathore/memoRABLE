import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {importSource} from "@/import/import-source";
import {renderMode} from "@/render/render-bundle";
import {visualReading,validSpan} from "@/visuals/evidence";
import {buildPrintDocument,buildWordDocument} from "@/utils/print-export";
const invoice=readFileSync("tests/fixtures/archetypes/invoice.md","utf8");
const parse=(raw:string)=>{const r=importSource({raw,label:"currency.md"});if(!r.ok)throw Error();return r.value};
describe("currency context and export source visibility",()=>{
 for(const label of["Currency: CAD","Currency code: AUD","All amounts in USD","Currency: XYZ","Currency: EUR"])it(`preserves exact context ${label} without inferring symbol meaning`,()=>{const raw=invoice.replace("Payment terms: Net 30","Payment terms: Net 30\n"+label);const d=parse(raw);const v=visualReading(d,raw);expect(v.kind).toBe("comparison");if(v.kind!=="comparison")return;expect(v.context.some(s=>s.quote===label&&validSpan(raw,s))).toBe(true);for(const mode of["email","web","document"]as const){const h=renderMode(d,mode,"editorial",raw).html!;expect(h).toContain(label);expect(h).not.toContain("Currency code is not specified");}});
 it("does not invent an ISO code from a bare symbol",()=>{for(const symbol of["$","€","£"]){const raw=invoice.replace(/\$/g,symbol),d=parse(raw),v=visualReading(d,raw);expect(v.kind).toBe("comparison");for(const mode of["email","web","document"]as const){const h=renderMode(d,mode,"editorial",raw).html!;expect(h).not.toContain("Currency code is not specified");expect(h).not.toContain("USD");expect(h).not.toContain("GBP");expect(h).not.toContain("EUR");}}});
 it("quotes conflicting labels instead of silently choosing one",()=>{const raw=invoice.replace("Payment terms: Net 30","Currency: CAD\nCurrency: USD"),d=parse(raw);const h=renderMode(d,"email","editorial",raw).html!;expect(h).toContain("Currency: CAD");expect(h).toContain("Currency: USD");expect(h).toContain("Source labels are quoted without resolving currency ambiguity");});
 it("only printable copies open disclosure, HTML stays collapsed and source is exact",()=>{const d=parse(invoice),web=renderMode(d,"web","editorial",invoice).html!;expect(web).toContain('<details id="source-inspector">');for(const out of[buildPrintDocument(web),buildWordDocument(web,"invoice")]){expect(out).toMatch(/<details\b[^>]*\bopen(?:[\s=>])/);expect(out).toContain("Fleet analytics seat licenses");expect(out).toContain("Onboarding workshop");}expect(web).toContain('<details id="source-inspector">');expect(buildPrintDocument(buildPrintDocument(web)).match(/<details[^>]*open/g)).toHaveLength(1);});
});

it("escapes currency context markup and preserves disclosure attributes in copies",()=>{
 const raw=invoice.replace("Payment terms: Net 30",'Currency: CAD <img src=x onerror=alert(1)>');const d=parse(raw);const h=renderMode(d,"email","editorial",raw).html!;expect(h).toContain("&lt;img");expect(h).not.toContain("<img src=x");
 const fixture='<details id="open-panel" class="x"><summary>Evidence</summary><pre>Exact</pre></details><details open="open"><summary>Already</summary></details>';
 const print=buildPrintDocument(fixture);expect(print).toContain('<details id="open-panel" class="x" open>');expect(print).toContain('<details open="open">');expect(print).not.toContain('open="open" open');
});
