/**
 * Writes the Sunday letter in every output to out/letter/, for CI to keep as an
 * artifact and for the README's pictures: the email (HTML and plain text), the
 * page, the decision record as a PDF and the share card as PNGs.
 * Run with `npm run letter`. Needs the optional engines (satori, resvg, react-pdf).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@hyper-elements/react";
import { renderImage } from "@hyper-elements/react/image";
import { renderPdf } from "@hyper-elements/react/pdf";
import { LetterEmail } from "@/letter/email";
import { LetterPage } from "@/letter/page";
import { DecisionRecord } from "@/letter/record";
import { WeekCard } from "@/letter/card";
import { sampleWeek } from "@/letter/sample";

const OUT = join(process.cwd(), "out", "letter");
const FONTS = join(process.cwd(), "public", "fonts", "letter");
const font = async (family: string, file: string, style: "normal" | "italic" = "normal", weight = 400) =>
  ({ family, src: new Uint8Array(await readFile(join(FONTS, file))), style, weight });

describe("the Sunday letter, written out", () => {
  it("as every output", async () => {
    await mkdir(OUT, { recursive: true });
    const fonts = await Promise.all([
      font("Archivo Black", "ArchivoBlack-Regular.ttf"),
      font("Crimson Text", "CrimsonText-Italic.ttf", "italic"),
      font("Crimson Text", "CrimsonText-Regular.ttf"),
      font("DM Sans", "DMSans-Variable.ttf"),
      font("Anonymous Pro", "AnonymousPro-Regular.ttf"),
      font("Anonymous Pro", "AnonymousPro-Bold.ttf", "normal", 700),
    ]);

    const email = await render(<LetterEmail {...sampleWeek} />);
    await writeFile(join(OUT, "email.html"), email.html);
    await writeFile(join(OUT, "email.txt"), email.text ?? "");

    const page = await render(<LetterPage {...sampleWeek} />);
    await writeFile(join(OUT, "page.html"), page.html);

    const record = await renderPdf(<DecisionRecord {...sampleWeek} />, { fonts });
    await writeFile(join(OUT, "record.pdf"), record.pdf);
    expect(record.pdf.byteLength).toBeGreaterThan(10_000);

    for (const format of ["landscape", "square"] as const) {
      const card = await renderImage(<WeekCard {...sampleWeek} format={format} />, { fonts, scale: 2 });
      await writeFile(join(OUT, `card-${format}.png`), card.image);
      expect(card.width).toBe(format === "square" ? 1080 : 1200);
    }
  }, 120_000);
});
