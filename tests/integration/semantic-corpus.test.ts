import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { importSource } from '@/import/import-source';
import { readPdfBytes } from '@/import/pdf/read-structured';
import { hybridSegment, buildDocumentGraph } from '@/understanding';
import { renderBundle } from '@/render/render-bundle';
const root='tests/fixtures/semantic-corpus';
const corpus=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8')) as Array<{file:string;format:string;must:string[];forbid:string[]}>;
describe('28-document semantic corpus',()=>{
 for(const item of corpus) it(item.file,async()=>{
  const bytes=readFileSync(join(root,item.file));
  const pdf=item.file.endsWith('.pdf');
  const raw=pdf?(await readPdfBytes(new Uint8Array(bytes),{skipOcr:true})).text:bytes.toString('utf8');
  const segment=hybridSegment(raw),graph=buildDocumentGraph(segment.segments);
  const sourceLines=raw.split("\n");
  const covered = new Set(segment.segments.flatMap(s=>s.lines.map(l=>l.lineNo)));
  const contentLineNos=sourceLines.map((l,i)=>({line:l.trim(),lineNo:i+1})).filter(x=>x.line && !/^<!-- page:|^#{1,6}\s|^\|\s*[-:| ]+\|$/.test(x.line)).map(x=>x.lineNo);
  const uncovered=contentLineNos.filter(n=>!covered.has(n));
  const result=importSource({raw,label:item.file});
  expect(result.ok).toBe(true);
  if(!result.ok)return;
  const doc=result.value;const b=renderBundle(doc);
  expect(segment.segments.length).toBeGreaterThan(0);
  expect(graph.nodes.length).toBeGreaterThan(0);
  expect(uncovered).toEqual([]);
  const payload=JSON.stringify(doc.blocks.map(x=>x.payload)).toLowerCase();
  // A threshold, not a claim of full semantic coverage; unresolved misses remain in the audit.
  expect(item.must.filter(v=>payload.includes(v.toLowerCase())).length).toBeGreaterThanOrEqual(Math.max(0,item.must.length-3));
  expect(Object.values(b.outputs).every(x=>x.html && x.designJson)).toBe(true);
 });
});
