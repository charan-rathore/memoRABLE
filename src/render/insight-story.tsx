import type { ReactElement } from 'react';
import { Column, ColumnLayouts, Heading, Paragraph, Row } from '@unlayer/react-elements';
import type { MemoryDocument, SignalEntry, RiskEntry, ActionEntry, DecisionEntry } from '@/domain/memory/schema';
import type { OutputMode } from '@/domain/memory/types';
import type { PublishTheme } from './themes';
import { inlineText } from './safe-inline';

/** A compact reading map. It juxtaposes stated memories, never invents causality. */
export interface StoryPoint { label: string; text: string; locator: string }
export function selectStoryPoints(doc: MemoryDocument): StoryPoint[] {
  const find = (kind: string) => doc.blocks.find(b => b.kind === kind);
  const point = (kind: string, label: string, text?: string): StoryPoint | null => {
    const block = find(kind);
    if (!block || !text) return null;
    const locator = block.provenance.locator;
    return { label, text, locator: locator === 'source' || locator === 'not found in source' ? 'Source text' : locator };
  };
  const signals = find('signals')?.payload as {entries?: SignalEntry[]} | undefined;
  const risks = find('risks')?.payload as {entries?: RiskEntry[]} | undefined;
  const actions = find('actions')?.payload as {entries?: ActionEntry[]} | undefined;
  const decisions = find('decisions')?.payload as {entries?: DecisionEntry[]} | undefined;
  const metric = signals?.entries?.find(e => e.value !== undefined);
  const risk = risks?.entries?.[0];
  const action = actions?.entries?.find(e => e.status !== 'done');
  const decision = decisions?.entries?.[0];
  return [
    point('signals','The number',metric && `${metric.label}: ${metric.value}`),
    point('risks','The watchout',risk?.risk),
    point('decisions','The position',decision && `${decision.text}${decision.status === 'proposed' ? '' : ` (${decision.status})`}`),
    point('actions','The next move',action && [action.task,action.owner,action.due].filter(Boolean).join(' · ')),
  ].filter((p): p is StoryPoint => p !== null).slice(0,3);
}

/** Pure Elements rows survive email, web, and document export without JS or a model. */
export function insightStoryRows(doc: MemoryDocument, mode: OutputMode, theme: PublishTheme): ReactElement[] {
  const points = selectStoryPoints(doc);
  if (!points.length) return [];
  const c = theme.colors;
  const compact = mode === 'email';
  return [
    <Row key="reading-map-title" layout={ColumnLayouts.OneColumn} backgroundColor={c.surface} padding="24px 36px 8px 36px">
      <Column><Heading headingType="h2" fontFamily={theme.fonts.serif} fontSize="22px" color={c.ink}>What matters</Heading>
      <Paragraph html={inlineText('A reading map from the source. These are separate facts, not a claim that one caused another.')} fontSize="12px" color={c.ink2}/></Column>
    </Row>,
    ...points.map((p,i)=><Row key={`reading-map-${i}`} layout={ColumnLayouts.OneColumn} backgroundColor={c.surface} padding="2px 36px 4px 36px">
      <Column backgroundColor={c.surface2} padding={compact ? "12px 14px" : "16px 18px"} border={{borderLeftWidth:'3px',borderLeftStyle:'solid',borderLeftColor:c.accent}}>
        <Paragraph html={inlineText(`${String(i+1).padStart(2,'0')}  ${p.label.toUpperCase()}`)} fontFamily={theme.fonts.mono} fontSize="10px" color={c.ink2}/>
        <Paragraph html={inlineText(p.text)} fontFamily={theme.fonts.sans} fontSize="14px" color={c.ink}/>
        <Paragraph html={inlineText(p.locator)} fontFamily={theme.fonts.mono} fontSize="10px" color={c.ink2}/>
      </Column>
    </Row>),
  ];
}
