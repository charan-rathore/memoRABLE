import {it} from 'vitest';
import {importSource} from '@/import/import-source';
it('inspect scoped conditions and combining marks',()=>{
 for(const line of [
 'Only if the visa is rejected, the passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026.',
 'The passport renewal is due February 14, 2027 only if approved. The tatkaal conversion is due November 3, 2026.',
 'The renewal for Cafe\u0301 is due February 14, 2027. The tatkaal conversion is due November 3, 2026.',
 'The passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026?!',
 'In case the visa is rejected, the passport renewal is due February 14, 2027. The tatkaal conversion is due November 3, 2026.'
 ]){const r=importSource({raw:'# Passport Renewal\n\n'+line+'\n',label:'probe.md'});if(r.ok)console.log(JSON.stringify({line,timeline:r.value.blocks.find(b=>b.kind==='timeline')?.payload}));}
});
