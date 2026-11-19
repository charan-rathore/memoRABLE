import {it,expect} from 'vitest';
import {importSource} from '@/import/import-source';
for (const line of ['The bitwise operator a | b combines flags.', 'The expression |x| gives the absolute value.', '`cat file | grep term` filters the log.']) {
 it(line,()=>{const r=importSource({raw:'# Operator Notes\n\n'+line,label:'operators.md'});expect(r.ok).toBe(true);if(r.ok){const b=r.value.blocks.find(x=>x.kind==='snapshot');expect((b?.payload as {summary?:string})?.summary).toContain(line.replace(/`/g,'').replace(/\.$/,''));}});
}
