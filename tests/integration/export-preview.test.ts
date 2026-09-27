import { it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importSource } from '@/import/import-source';
import { renderBundle } from '@/render/render-bundle';
import type { DecisionsPayload } from '@/domain/memory/schema';
it('builds local reading-map previews',()=>{
 const raw=readFileSync('tests/fixtures/semantic-corpus/board-report.md','utf8');
 const r=importSource({raw,label:'board-report.md'});expect(r.ok).toBe(true);if(!r.ok)return;
 const outputs=renderBundle(r.value).outputs;
 for(const mode of ['web','email','document'] as const){
  const html=outputs[mode].html ?? '';
  expect(html).toContain('Read this first');
  expect(html).not.toContain('Nothing here reads as a summary yet');
  const preserved = html.indexOf('PRESERVED FROM SOURCE');
  if (preserved >= 0) expect(html.indexOf('Read this first')).toBeLessThan(preserved);
 }
});

it('keeps a board approval approved rather than proposed',()=>{
 const raw=readFileSync('tests/fixtures/semantic-corpus/board-report.md','utf8');
 const r=importSource({raw,label:'board-report.md'});expect(r.ok).toBe(true);if(!r.ok)return;
 const block=r.value.blocks.find(b=>b.kind==='decisions');
 const decisions=block?.payload as DecisionsPayload | undefined;
 const freeze=decisions?.entries.find(e=>/hiring freeze/i.test(e.text));
 expect(freeze?.status).toBe('approved');
});

it('does not headline context-free table rows',()=>{
 const raw=readFileSync('tests/fixtures/semantic-corpus/comparison.md','utf8');
 const r=importSource({raw,label:'comparison.md'});expect(r.ok).toBe(true);if(!r.ok)return;
 expect(r.value.evidenceReport?.takeaways.every(item=>!item.claim.startsWith('|'))).toBe(true);
 const html=renderBundle(r.value).outputs.web.html ?? '';
 expect(html.indexOf('Read this first')).toBeLessThan(html.indexOf('PRESERVED FROM SOURCE'));
});
