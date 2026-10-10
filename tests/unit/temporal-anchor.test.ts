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
