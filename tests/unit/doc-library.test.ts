// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {rememberLibraryDoc,listLibraryDocs} from "@/stats/doc-library";
beforeEach(()=>localStorage.clear());
it("keeps different documents with the same common filename",()=>{
 rememberLibraryDoc({title:"First",label:"notes.txt",sourceText:"First source"});
 rememberLibraryDoc({title:"Second",label:"notes.txt",sourceText:"Second source"});
 expect(listLibraryDocs().map(d=>d.title)).toEqual(["Second","First"]);
});
it("remembers one copy of an identical document",()=>{
 rememberLibraryDoc({title:"First",label:"a.txt",sourceText:"same"});
 rememberLibraryDoc({title:"Again",label:"b.txt",sourceText:"same"});
 expect(listLibraryDocs()).toHaveLength(1);
});

describe("recent document library promises",()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));});
 afterEach(()=>vi.useRealTimers());
 it("prunes documents older than seven days when listing",()=>{
  localStorage.setItem("memorable.library.v1",JSON.stringify([{id:"old",title:"Old document",label:"old.txt",sourceText:"text",savedAt:Date.now()-8*24*60*60*1000}]));
  expect(listLibraryDocs()).toEqual([]);
  expect(JSON.parse(localStorage.getItem("memorable.library.v1")!)).toEqual([]);
 });
 it("keeps only the 24 most recently saved documents",()=>{
  for(let index=0;index<25;index+=1){
   vi.setSystemTime(new Date(Date.now()+1));
   rememberLibraryDoc({title:`Document ${index}`,label:`document-${index}.txt`,sourceText:`source ${index}`});
  }
  const docs=listLibraryDocs();
  expect(docs).toHaveLength(24);
  expect(docs[0]?.title).toBe("Document 24");
  expect(docs.some((doc)=>doc.title==="Document 0")).toBe(false);
 });
 it("keeps a document just under seven days old but expires one at the boundary",()=>{
  localStorage.setItem("memorable.library.v1",JSON.stringify([
   {id:"fresh",title:"Almost seven days",label:"fresh.txt",sourceText:"text",savedAt:Date.now()-(7*24*60*60*1000-1)},
   {id:"edge",title:"Exactly seven days",label:"edge.txt",sourceText:"text",savedAt:Date.now()-7*24*60*60*1000},
  ]));
  expect(listLibraryDocs().map((doc)=>doc.title)).toEqual(["Almost seven days"]);
 });
 it("caps remembered source text at 1,048,576 UTF-16 units",()=>{
  const doc=rememberLibraryDoc({title:"Large document",label:"large.txt",sourceText:"x".repeat(1_048_580)});
  expect(doc.sourceText).toHaveLength(1_048_576);
  expect(listLibraryDocs()[0]?.sourceText).toHaveLength(1_048_576);
 });
 it("counts the excerpt cap in UTF-16 units, not code points",()=>{
  const doc=rememberLibraryDoc({title:"Astral document",label:"astral.txt",sourceText:"\u{1F600}".repeat(524_289)});
  expect(doc.sourceText).toHaveLength(1_048_576);
  expect([...doc.sourceText]).toHaveLength(524_288);
  expect([...doc.sourceText].at(-1)).toBe("\u{1F600}");
 });
});
