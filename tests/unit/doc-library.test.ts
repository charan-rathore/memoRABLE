// @vitest-environment jsdom
import {beforeEach,expect,it} from "vitest";
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
