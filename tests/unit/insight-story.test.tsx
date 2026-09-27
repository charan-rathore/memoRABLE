import { describe,it,expect } from 'vitest';
import { importSource } from '@/import/import-source';
import { selectStoryPoints } from '@/render/insight-story';
import { renderBundle } from '@/render/render-bundle';
describe('source-bound reading map',()=>{
 it('shows facts without inventing a causal edge in all three exports',()=>{
  const raw='# Vendor bids\n\n## Metrics\nCost: $7,200\n\n## Risks\nLate deliveries may delay the pilot.\n\n## Actions\n- Audit the schedule before Friday.\n';
  const r=importSource({raw,label:'bids.md'});expect(r.ok).toBe(true);
  if(!r.ok)return;
  const points=selectStoryPoints(r.value);
  expect(points.map(p=>p.label)).toContain('The number');
  expect(points.map(p=>p.label)).toContain('The watchout');
  expect(points.every(p=>p.text.length>0)).toBe(true);
  const bundle=renderBundle(r.value);
  for(const output of Object.values(bundle.outputs)){
   expect(output.html).toContain("Read this first");
   expect(output.html).toContain('Source-backed takeaways');
   expect(output.designJsonError).toBeNull();
  }
 });
});
