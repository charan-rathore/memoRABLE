import {canonicalJsonString} from "@/render/export-source";
import {buildRelations} from "@/understanding/graph";
import {describe,it,expect} from "vitest";
import{readFileSync}from"node:fs";
import{importSource}from"@/import/import-source";
import{renderBundle}from"@/render/render-bundle";
import{signalEntrySchema,snapshotPayloadSchema,memorySourceSchema,memoryDocumentSchema}from"@/domain/memory/schema";
const source=(id:string)=>readFileSync(`tests/fixtures/archetypes/${id}.md`,"utf8");
const parse=(raw:string)=>{const r=importSource({raw,label:"test.md"});if(!r.ok)throw Error();return r.value;};
describe("explicit visual semantic metadata",()=>{
 it("retains hypothesis modality in canonical data and all exports",()=>{const d=parse(source("research"));const snap=d.blocks.find(b=>b.kind==="snapshot")!;expect(snap.payload).toHaveProperty("goalKind","hypothesis");const signals=d.blocks.find(b=>b.kind==="signals")!;expect(JSON.stringify(signals.payload)).toContain('"claimKind":"hypothesis"');expect(JSON.stringify(signals.payload)).not.toContain('"value":"92%"');for(const out of Object.values(renderBundle(d).outputs)){expect(out.error).toBeNull();expect(out.html).toContain("HYPOTHESIS UNDER TEST");expect(out.html).not.toContain("PRIMARY GOAL");expect(out.html).toContain("92%");}});
 it("never treats a question as finding or finding as shipped workflow",()=>{const d=parse(source("research"));const b=d.blocks.find(b=>b.kind==="timeline")!;if(!("entries"in b.payload))throw Error();expect(b.payload.entries.length).toBeGreaterThan(0);for(const e of b.payload.entries){expect(e).not.toHaveProperty("state");expect(e).toHaveProperty("observationKind","research-finding");expect(JSON.stringify(e)).not.toMatch(/Whether sparse/);}expect(d.relations).toEqual([]);expect(memoryDocumentSchema.safeParse(d).success).toBe(true);const generic=JSON.parse(JSON.stringify(d));generic.archetype.id="generic";expect(memoryDocumentSchema.safeParse(generic).success).toBe(false);for(const out of Object.values(renderBundle(d).outputs)){expect(out.html).not.toContain("scheduled by");expect(out.html).not.toContain("DONE");}});
 it("round-trips typed findings and rejects malformed states without changing legacy saved data",()=>{
 const d=parse(source("research"));const exported=canonicalJsonString(d);const re=parse(exported);expect(re.archetype?.id).toBe("research");expect(re.relations).toEqual([]);expect(re.blocks.map(b=>b.payload)).toEqual(d.blocks.map(b=>b.payload));
 const raw=JSON.parse(exported);const entry=raw.blocks.find((b:{kind:string})=>b.kind==="timeline").payload.entries[0];
 for(const state of ["done","bogus",null]){entry.state=state;expect(memorySourceSchema.safeParse(raw).success).toBe(false);}delete entry.state;
 entry.date="2026-01-01";expect(memorySourceSchema.safeParse(raw).success).toBe(false);entry.date="Finding";
 entry.observationKind="question";expect(memorySourceSchema.safeParse(raw).success).toBe(false);delete entry.observationKind;
 expect(memorySourceSchema.safeParse(raw).success).toBe(false);entry.state="done";expect(memorySourceSchema.safeParse(raw).success).toBe(true);
 const legacy=parse(JSON.stringify(raw));expect(JSON.stringify(legacy)).toContain('"state":"done"');
 const timeline=d.blocks.find(b=>b.kind==="timeline")!;const graph=buildRelations(d.blocks);expect(graph.filter(e=>/timeline:/.test(e.from+e.to))).toEqual([]);expect(timeline.payload).toHaveProperty("entries");
 for(const output of Object.values(renderBundle(re).outputs)){expect(output.error).toBeNull();expect(output.html).toContain("41%");expect(output.html).toContain("Local-window attention dropped recall");}
 });
 it("tags only explicit invoice roles and renders summaries separately",()=>{const d=parse(source("invoice")),b=d.blocks.find(b=>b.kind==="signals")!;expect(JSON.stringify(b.payload)).toContain('"financialRole":"line-item"');expect(JSON.stringify(b.payload)).toContain('"financialRole":"subtotal"');expect(JSON.stringify(b.payload)).toContain('"financialRole":"amount-due"');for(const out of Object.values(renderBundle(d).outputs)){expect(out.error).toBeNull();expect(out.html).toContain("Invoice summary");expect(out.html).toContain("$15,500");}});
 it("does not infer financial roles from numeric generic signals",()=>{const d=parse("# Review\n## Signals\n- Revenue: $15,500\n- Cost: $3,500");expect(JSON.stringify(d)).not.toContain("financialRole");});
 it("does not tag an unlabeled research threshold as hypothesis",()=>{const d=parse(source("research").replace("## Hypothesis","## Objective"));expect(JSON.stringify(d)).not.toContain('"goalKind":"hypothesis"');expect(JSON.stringify(d)).not.toContain('"claimKind":"hypothesis"');});
 it("keeps old schema payloads valid and rejects unknown metadata enums",()=>{expect(signalEntrySchema.safeParse({label:"Cost",value:"$12"}).success).toBe(true);expect(signalEntrySchema.safeParse({label:"Cost",financialRole:"guessed"}).success).toBe(false);expect(signalEntrySchema.safeParse({label:"Claim",claimKind:"measured"}).success).toBe(false);expect(snapshotPayloadSchema.safeParse({heading:"Paper",summary:"A",goalKind:"confirmed"}).success).toBe(false);expect(memorySourceSchema.safeParse({version:1,title:"A",blocks:[{kind:"signals",payload:{entries:[{label:"Cost",financialRole:"guessed"}]}}]}).success).toBe(false);});
});
