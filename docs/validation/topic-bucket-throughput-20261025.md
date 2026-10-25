# Incremental topic bucket vocabulary

Based on main825f991. Long soft-wrapped unheaded prose rebuilt its entire growing vocabulary and word count for each next line. Cohesive prose never split, causing quadratic repeated text processing.

Keep exact bucket vocabulary union and word count incrementally, reset both when a topic split starts a fresh bucket. IdenticalJaccardformula,threshold0.12,80wordminimumandstructuralrules.

ActualhybridSegment1200lineprose5trialmedian2runs3999.84msbaseline->21.17mscandidate. Local500msbudgetRED/GREEN, notcommittedtimingthreshold. Ordinary40linepath7trialmedian100runs175.53->17.95ms.

Completeoutputbyte-identicalfor1200linesand12structural/resetfixtures(7/8/20/100lines,topicchanges,heading,paragraphboundaries). ActualimportSource90linefullresultincludingIDs/hash/provenancebyte-identical. Committedfingerprintscapturedfrombaseline, notcandidate-derivedexpectations.

Full503PASS2existing skips beforeadditional12fixturecontrol; thatcontrolseparatelyPASS. Type/lint/buildPASS. ActualCI/browser/freshreviewrequiredbeforemerge. LocalNodeperformance,notdeployedtimingclaim. NoAPI/schema/UI/inferencethreshold/dependencychanges.
