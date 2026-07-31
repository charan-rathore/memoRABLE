import type { OutputMode } from "@/domain/memory/types";

/**
 * Exact Unlayer Elements used per publication mode, with deep links into
 * https://github.com/unlayer/elements so judges can verify composition.
 */

const ROOT = "https://github.com/unlayer/elements/blob/main/packages/react/src/components";

export interface ElementRef {
  name: string;
  href: string;
  role: string;
}

export const ELEMENTS_BY_MODE: Record<OutputMode, ElementRef[]> = {
  email: [
    { name: "Email", href: `${ROOT}/Email.tsx`, role: "Root — Outlook/Gmail-safe shell" },
    { name: "Row", href: `${ROOT}/Row.tsx`, role: "Layout band" },
    { name: "Column", href: `${ROOT}/Column.tsx`, role: "Column inside a Row" },
    { name: "Heading", href: `${ROOT}/Heading.tsx`, role: "Masthead & section titles" },
    { name: "Paragraph", href: `${ROOT}/Paragraph.tsx`, role: "Body copy" },
    { name: "Menu", href: `${ROOT}/Menu.tsx`, role: "Jump navigation" },
    { name: "Button", href: `${ROOT}/Button.tsx`, role: "Footer CTA" },
    { name: "Divider", href: `${ROOT}/Divider.tsx`, role: "Rules between bands" },
    { name: "Table", href: `${ROOT}/Table.tsx`, role: "Risks grid" },
  ],
  web: [
    { name: "Page", href: `${ROOT}/Page.tsx`, role: "Root — responsive web page" },
    { name: "Row", href: `${ROOT}/Row.tsx`, role: "Full-bleed & content bands" },
    { name: "Column", href: `${ROOT}/Column.tsx`, role: "Column inside a Row" },
    { name: "Heading", href: `${ROOT}/Heading.tsx`, role: "Hero & section titles" },
    { name: "Paragraph", href: `${ROOT}/Paragraph.tsx`, role: "Body copy" },
    { name: "Menu", href: `${ROOT}/Menu.tsx`, role: "In-page navigation" },
    { name: "Button", href: `${ROOT}/Button.tsx`, role: "Next-step CTA" },
    { name: "Divider", href: `${ROOT}/Divider.tsx`, role: "Section rules" },
    { name: "Table", href: `${ROOT}/Table.tsx`, role: "Risks grid" },
  ],
  document: [
    { name: "Document", href: `${ROOT}/Document.tsx`, role: "Root — print/PDF optimized" },
    { name: "Row", href: `${ROOT}/Row.tsx`, role: "Cover, TOC, sections" },
    { name: "Column", href: `${ROOT}/Column.tsx`, role: "Column inside a Row" },
    { name: "Heading", href: `${ROOT}/Heading.tsx`, role: "Title page & roman sections" },
    { name: "Paragraph", href: `${ROOT}/Paragraph.tsx`, role: "Body copy" },
    { name: "Menu", href: `${ROOT}/Menu.tsx`, role: "Contents jump list" },
    { name: "Button", href: `${ROOT}/Button.tsx`, role: "Print action" },
    { name: "Divider", href: `${ROOT}/Divider.tsx`, role: "Cover rule" },
    { name: "Table", href: `${ROOT}/Table.tsx`, role: "Risks table" },
  ],
};

export const ELEMENTS_REPO = "https://github.com/unlayer/elements";
