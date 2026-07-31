import type { OutputMode } from "@/domain/memory/types";
import type { PublishThemeId } from "./themes";
import { resolveTheme } from "./themes";

/**
 * Exact Unlayer Elements used for a mode + preset, with deep links into
 * https://github.com/unlayer/elements so judges can verify composition.
 */

const ROOT = "https://github.com/unlayer/elements/blob/main/packages/react/src/components";

export interface ElementRef {
  name: string;
  href: string;
  role: string;
}

const el = (name: string, file: string, role: string): ElementRef => ({
  name,
  href: `${ROOT}/${file}`,
  role,
});

const CORE = {
  Email: el("Email", "Email.tsx", "Root: Outlook/Gmail-safe shell"),
  Page: el("Page", "Page.tsx", "Root: responsive web page"),
  Document: el("Document", "Document.tsx", "Root: print/PDF optimized"),
  Row: el("Row", "Row.tsx", "Layout band"),
  Column: el("Column", "Column.tsx", "Column inside a Row"),
  Heading: el("Heading", "Heading.tsx", "Titles"),
  Paragraph: el("Paragraph", "Paragraph.tsx", "Body copy"),
  Menu: el("Menu", "Menu.tsx", "Jump navigation"),
  Button: el("Button", "Button.tsx", "Call to action"),
  Divider: el("Divider", "Divider.tsx", "Section rule"),
  Table: el("Table", "Table.tsx", "Risks / data grid"),
};

/** Elements actually composed for this mode under the active preset. */
export function elementsFor(mode: OutputMode, themeId: PublishThemeId | string = "editorial"): ElementRef[] {
  const theme = resolveTheme(themeId);
  const { chrome } = theme;
  const root =
    mode === "email" ? CORE.Email : mode === "web" ? CORE.Page : CORE.Document;

  const list: ElementRef[] = [root, CORE.Row, CORE.Column, CORE.Heading, CORE.Paragraph];

  if (chrome.showNavMenu) {
    list.push({ ...CORE.Menu, role: mode === "document" ? "Contents jump list" : "In-document navigation" });
  }
  if (chrome.showFooterButton) {
    list.push({ ...CORE.Button, role: mode === "email" ? "Jump CTA" : "Next-step CTA" });
  }
  if (chrome.showToc || theme.calloutStyle === "rule" || theme.id === "editorial" || theme.id === "academic") {
    list.push({ ...CORE.Divider, role: theme.id === "academic" ? "Scholarly hairline rules" : "Cover / section rules" });
  }
  if (chrome.preferTables) {
    list.push({ ...CORE.Table, role: theme.id === "executive" ? "KPI / risks table" : "Risks table" });
  }

  // Minimal: deliberately spare (no Menu, Button, Table, Divider extras beyond type).
  if (theme.id === "minimal") {
    return [root, CORE.Row, CORE.Column, CORE.Heading, CORE.Paragraph];
  }

  return list;
}

/** @deprecated prefer elementsFor(mode, theme) */
export const ELEMENTS_BY_MODE: Record<OutputMode, ElementRef[]> = {
  email: elementsFor("email", "editorial"),
  web: elementsFor("web", "editorial"),
  document: elementsFor("document", "editorial"),
};

export const ELEMENTS_REPO = "https://github.com/unlayer/elements";
