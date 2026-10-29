import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {importSource} from "@/import/import-source";
import {canonicalJsonString} from "@/render/export-source";
import {ATLAS_JSON_SOURCE} from "@/import/examples/catalog";
const parsed=(raw:string)=>{const r=importSource({raw,label:"version-test"});if(!r.ok)throw Error(JSON.stringify(r.errors));return r.value;};
describe("explicit semantic wire version",()=>{
 it("keeps legacy v1 exports and payloads unchanged",()=>{const d=parsed(ATLAS_JSON_SOURCE),out=JSON.parse(canonicalJsonString(d));expect(out.version).toBe(1);expect(out.blocks.map((b:{payload:unknown})=>b.payload)).toEqual(d.blocks.map(b=>b.payload));expect(parsed(JSON.stringify(out)).blocks.map(b=>b.payload)).toEqual(d.blocks.map(b=>b.payload));});
 for(const id of ["research","invoice"])it(`uses v2 for ${id}, rejects mislabeled v1 and round-trips`,()=>{const d=parsed(readFileSync(`tests/fixtures/archetypes/${id}.md`,"utf8"));const out=JSON.parse(canonicalJsonString(d));expect(out.version).toBe(2);const re=parsed(JSON.stringify(out));for(const b of d.blocks)expect(re.blocks.find(x=>x.kind===b.kind)?.payload).toEqual(b.payload);expect(re.blocks).toHaveLength(6);out.version=1;const mislabeled=importSource({raw:JSON.stringify(out),label:"mislabeled"});expect(mislabeled.ok).toBe(false);if(!mislabeled.ok)expect(mislabeled.errors.some(e=>e.message.includes("requires version 2"))).toBe(true);});
 it("rejects unknown versions and unknown metadata in v2",()=>{const out=JSON.parse(canonicalJsonString(parsed(ATLAS_JSON_SOURCE)));out.version=3;expect(importSource({raw:JSON.stringify(out),label:"bad"}).ok).toBe(false);out.version=2;out.blocks[0].payload.goalKind="asserted";expect(importSource({raw:JSON.stringify(out),label:"bad"}).ok).toBe(false);});
});
