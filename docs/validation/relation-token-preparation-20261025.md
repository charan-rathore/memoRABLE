# Prepare link vocabulary once per pass

Based on merged86, main762766c. The relation link pass stemmed each source/target string again for every pair. With100entriesin eachkind, deterministicJSONimportspentmosttime repeatingunchangedtokenization.

Preparetargetvocabularyonce, sourcestokensonceperrow. Keepidentical2sharedtokenfloor,0.2threshold,minsize denominator,stablesort and2edgecap. Empty-sidefastreturn doesnoextra work. Nochange tospecialaction/phasepaths, graphsemanticsorsource.

ActualfullsixblockJSONimport,100entries/kind: baseline822.38ms->87.62ms median2imports/5trials;300mslocalcomparativebudgetRED/GREEN. Initialmeasurement769->91ms consistent. FullserializedMemoryDocument includingallIDs,hashes,provenance,relations byte-identical; committedbaselinefingerprintcontrol.

OrdinaryAtlasfixture7trialmedian100imports88.80msbaseline->78.13mscandidate. Full501PASS2existing skips,type/lint/buildPASS. TiminglocalNodeactualimport,notdeployedbrowserclaim. FreshCI/browser/reviewrequired beforemerge.
