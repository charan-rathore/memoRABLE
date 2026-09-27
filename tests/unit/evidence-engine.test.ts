import{describe,it,expect}from'vitest';import{importSource}from'@/import/import-source';import{buildEvidenceReport,sourceSpans}from'@/understanding/evidence-engine';
const make=(raw:string)=>{const r=importSource({raw,label:'source.md'});if(!r.ok)throw Error('import failed');return buildEvidenceReport(raw,r.value)};
describe('source-verified evidence layer',()=>{
 it('binds exact line offsets and page markers',()=>{const raw='<!-- page:2 -->\n# Results\nShorter forms improved completion from 54% to 68%, but did not measure retention.\n';const s=sourceSpans(raw);expect(s).toHaveLength(1);const first=s[0]!;expect(first.page).toBe(2);expect(raw.split('\n')[first.line-1]!.slice(first.start,first.end)).toBe(first.quote)});
 it('derives percentage-point movement and keeps the unmeasured caveat',()=>{const r=make('# Study\nShorter forms improved completion from 54% to 68%, but did not measure retention.');expect(r.hidden.some(x=>x.kind==='inferred'&&x.claim.includes('14 percentage points'))).toBe(true);expect([...r.takeaways,...r.hidden].some(x=>x.title==='Not established'||x.title==='Evidence limit')).toBe(true)});
 it('does not turn denied loss or unchosen vendor into a positive result',()=>{const r=make('# Status\nNo messages were lost.\nNo vendor has been chosen.');expect(r.takeaways.every(x=>x.kind==='stated'&&x.premises[0]!.quote===x.claim)).toBe(true);expect(r.hidden).toEqual([])});
 it('rejects arithmetic on unlike units',()=>{const r=make('# Report\nRevenue grew from 40% to 70 teams.');expect(r.hidden).toEqual([])});
});

describe('semantic grounding guard',()=>{
 it('does not treat the absence of approval as an approval',()=>{const raw='# Approval\nNo vendor has been chosen.\n';const r=make(raw);expect(r.takeaways.some(x=>x.claim==='No vendor has been chosen.')).toBe(true);expect(r.takeaways.every(x=>!/^vendor has been chosen/i.test(x.claim))).toBe(true)});
 it('keeps conditional plans conditional',()=>{const raw='# Grant\nIf approved, onboarding starts in January. Funding has not been awarded.\n';const r=make(raw);expect(r.takeaways.some(x=>/if approved/i.test(x.claim))).toBe(true);expect(r.takeaways.some(x=>/has not been awarded/i.test(x.claim))).toBe(true)});
});

describe('derived comparison guard',()=>{
 it('calculates a target gap only from explicit actual and target',()=>{const r=make('# Brief\nAudit coverage is 82%, below the 95% target.');expect(r.hidden.some(x=>x.rule==='target-gap'&&x.claim.includes('13 percentage points'))).toBe(true)});
 it('compares explicit bidder-price/delivery table with both line premises',()=>{const r=make('# Bids\n| Bidder | Price | Delivery |\n| --- | --- | --- |\n| Aster | $7,200 | 14 days |\n| Birch | $6,900 | 21 days |');expect(r.hidden.some(x=>x.rule==='tradeoff'&&x.premises.length===2&&x.claim.includes('$300 less')&&x.claim.includes('7 days sooner'))).toBe(true)});
 it('does not call invoice rows a tradeoff',()=>{const r=make('# Bill\n| Item | Price | Delivery |\n| --- | --- | --- |\n| A | $100 | 2 days |\n| B | $200 | 1 day |');expect(r.hidden.some(x=>x.rule==='tradeoff')).toBe(false)});
});

describe('cross-line insights',()=>{
 it('names mixed performance with two verified source spans',()=>{const r=make('# Board\n## Performance\n- Revenue: $2.4m, up 12% year on year.\n- Gross margin: 38%, down from 42%.');expect(r.hidden.some(x=>x.rule==='mixed-metrics'&&x.premises.length===2&&x.claim.includes('4 percentage points'))).toBe(true)});
 it('does not infer divergence from unrelated percent movements',()=>{const r=make('# Metrics\n- Traffic: 12%, up year on year.\n- Bounce rate: 38%, down from 42%.');expect(r.hidden.some(x=>x.rule==='mixed-metrics')).toBe(false)});
});
