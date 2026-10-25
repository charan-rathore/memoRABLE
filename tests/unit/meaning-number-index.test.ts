import { expect, it } from 'vitest';
import { dedupeByMeaning, saysTheSame } from '@/understanding/language';

function reference(items: string[]): string[] {
  const kept: string[] = [];
  for (const item of items) {
    if (item.trim() !== '' && !kept.some(k => saysTheSame(k, item))) kept.push(item);
  }
  return kept;
}

it('keeps exact reference decisions across numbered, unnumbered and same-key statements', () => {
  let seed = 20261025;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const base = [
    '', ' ', 'The operational project revenue increased.',
    'Project revenue increased for operational teams.',
    'Revenue rose to 1,500 units.', 'Revenue rose to 1500 units.',
    '6E 5342 arrives December 18.', '6E 5319 arrives December 20.',
    '100 cats', '100 CATS!', '100cats', '100 cats.',
    '2026 release 14', '14 release 2026', 'the and or',
  ];
  for (let trial = 0; trial < 80; trial++) {
    const items = Array.from({ length: 90 }, () => {
      const text = base[Math.floor(next() * base.length)]!;
      return next() < 0.35 ? `${text} account ${Math.floor(next() * 8)}` : text;
    });
    expect(dedupeByMeaning(items, x => x)).toEqual(reference(items));
  }
});

it('removes the quadratic number-identity scan on real public helper calls', () => {
  const items = Array.from({ length: 6000 }, (_, i) =>
    `Quarter ${i} revenue increased to ${i + 1} units for the measured operational project.`);
  const start = performance.now();
  expect(dedupeByMeaning(items, x => x)).toEqual(items);
  expect(performance.now() - start).toBeLessThan(300);
});

it('keeps the complete actual numbered import identical to the pre-change output', async () => {
  const { importSource } = await import('@/import/import-source');
  const { readFileSync } = await import('node:fs');
  const raw = '# Quarterly Operations\n\n' + Array.from({ length: 100 }, (_, i) =>
    `## Quarter ${i}\n\nRevenue increased to ${i + 1} units for the operational project. The approved delivery happened during quarter ${i}.`).join('\n\n');
  const baseline = readFileSync('tests/fixtures/performance/numbered-import-golden.json', 'utf8');
  expect(JSON.stringify(importSource({ raw, label: 'quarterly.md' }))).toBe(baseline);
});
