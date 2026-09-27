import type { ReactElement } from 'react';
import {Column,ColumnLayouts,Heading,Paragraph,Row} from '@unlayer/react-elements';
import type {MemoryDocument} from '@/domain/memory/schema';
import type {PublishTheme} from './themes';
import {inlineText} from './safe-inline';

/** Projection of already-verified claims; no new interpretation occurs here. */
export function evidenceStoryRows(doc:MemoryDocument,theme:PublishTheme):ReactElement[]{
 const report=doc.evidenceReport;if(!report||(!report.takeaways.length&&!report.hidden.length))return [];
 const c=theme.colors,rows:ReactElement[]=[];
 rows.push(<Row key="verified-story-heading" layout={ColumnLayouts.OneColumn} backgroundColor={c.surface} padding="24px 36px 9px 36px"><Column><Heading headingType="h2" color={c.ink} fontFamily={theme.fonts.serif} fontSize="23px">Read this first</Heading><Paragraph html={inlineText('Source-backed takeaways. Calculations are marked as inferred.')} fontSize="12px" color={c.ink2}/></Column></Row>);
 for(const [group,items] of [['takeaways',report.takeaways],['hidden',report.hidden]] as const){
  for(let i=0;i<items.length;i++){
   const item=items[i]!,p=item.premises[0]!;
   const place=`${p.page!==null?`Page ${p.page} · `:''}line ${p.line}`;
   const premises=item.premises.map(span=>`${span.page!==null?`Page ${span.page} · `:''}line ${span.line}: ${span.quote.slice(0,130)}`).join(' | ');
   rows.push(<Row key={`evidence-${group}-${i}`} layout={ColumnLayouts.OneColumn} backgroundColor={c.surface} padding="3px 36px 5px 36px"><Column backgroundColor={group==='hidden'?c.accentSoft:c.surface2} padding="13px 17px" border={{borderLeftWidth:'3px',borderLeftStyle:'solid',borderLeftColor:group==='hidden'?c.accent:c.line2}}><Paragraph html={inlineText(`${group==='hidden'?'INSIGHT':'MUST KNOW'} · ${item.kind.toUpperCase()} · ${item.title.toUpperCase()}`)} fontSize="10px" fontFamily={theme.fonts.mono} color={c.ink2}/><Paragraph html={inlineText(item.claim)} fontSize="15px" color={c.ink}/><Paragraph html={inlineText(item.premises.length>1?premises:`${place}: ${p.quote.slice(0,160)}`)} fontSize="11px" color={c.ink2}/></Column></Row>);
  }
 }
 return rows;
}
