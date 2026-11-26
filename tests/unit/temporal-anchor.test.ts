import {expect,it} from "vitest";
import {findAnchorDate} from "@/understanding/temporal";

it("ignores 8-digit runs that are not real calendar dates",()=>{
 expect(findAnchorDate("quarterly numbers","report-12345678.pdf").value).toBeNull();
 expect(findAnchorDate("quarterly numbers","report-12345678.pdf").confidence).toBe("none");
});

it("ignores dashed dates with impossible month or day",()=>{
 expect(findAnchorDate("quarterly numbers","x-2026-13-45.md").value).toBeNull();
 expect(findAnchorDate("quarterly numbers","x-2026-02-30.md").value).toBeNull();
 expect(findAnchorDate("quarterly numbers","x-2023-02-29.md").value).toBeNull();
});

it("still anchors on valid filename dates",()=>{
 expect(findAnchorDate("quarterly numbers","notes-20260315.md")).toEqual({value:"2026-03-15",confidence:"medium",source:"filename"});
 expect(findAnchorDate("quarterly numbers","notes-2026-03-15.md")).toEqual({value:"2026-03-15",confidence:"medium",source:"filename"});
 expect(findAnchorDate("quarterly numbers","leap-2024-02-29.md").value).toBe("2024-02-29");
});

it("rejects filename dates outside the plausible year window",()=>{
 expect(findAnchorDate("quarterly numbers","notes-18500101.md").value).toBeNull();
 expect(findAnchorDate("quarterly numbers","notes-30001231.md").value).toBeNull();
});

it("an explicit in-text anchor still wins over a bad filename date",()=>{
 const r=findAnchorDate("As of 2026-03-01 the plan changed","report-12345678.pdf");
 expect(r).toEqual({value:"2026-03-01",confidence:"high",source:"explicit"});
});

it("does not use impossible dates from explicit lines or ordinary body text", () => {
  expect(findAnchorDate("As of 2026-02-30 the plan changed").value).toBeNull();
  expect(findAnchorDate("Snapshot 2023-02-29.").value).toBeNull();
});

it("continues searching for a valid ISO anchor and preserves source precedence", () => {
  expect(findAnchorDate("As of 2026-02-30. Dated 2024-02-29.")).toEqual({
    value: "2024-02-29", confidence: "high", source: "explicit",
  });
  expect(findAnchorDate("Snapshot 2026-02-30. Recorded 2026-03-01.")).toEqual({
    value: "2026-03-01", confidence: "medium", source: "body",
  });
  expect(findAnchorDate("As of 2026-02-30.", "notes-2026-03-01.md").source).toBe("filename");
  expect(findAnchorDate("Historical record 1969-07-20.").value).toBe("1969-07-20");
});
