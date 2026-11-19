import {it,expect} from 'vitest';
import {inferTimeline} from '@/understanding/infer-events';
import {importSource} from '@/import/import-source';
it('real offsets and whole evidence',()=>{
 const text='The passport renewal is due February 14, 2027.  The tatkaal conversion is due November 3, 2026.';
 const out=inferTimeline([{text,lineNo:3,sectionTitle:null,listItem:false}]);
 console.log(JSON.stringify(out));
 for(const o of out){const e=o.evidence;if(e.segmentStart!==undefined){console.log('slice',JSON.stringify(text.slice(e.segmentStart,e.segmentEnd)),JSON.stringify(e.text));expect(text.slice(e.segmentStart,e.segmentEnd)).toBe(e.text);}}
});
it('retain last fused obligation when inferred budget is exhausted',()=>{
 const raw='# Notes\n\n'+Array.from({length:23},(_,i)=>`The unique deliverable number ${i} is due January ${i+1}, 2027.`).join('\n\n')+'\n\nThe passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026.\n';
 const r=importSource({raw,label:'probe.md'});if(r.ok){const t=r.value.blocks.find(b=>b.kind==='timeline')?.payload;console.log('budget',JSON.stringify(t));expect(JSON.stringify(t)).toContain('tatkaal');}
});
