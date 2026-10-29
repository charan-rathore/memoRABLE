# Semantic JSON v2

The reader accepts versions 1 and 2. Legacy payloads export as v1. New typed research hypotheses, invoice amount roles and non-workflow timeline observations export as v2. The payload decides the wire version, not the age of the file.

v1 cannot contain goalKind, claimKind, financialRole or observationKind. v2 allows their defined enums, with the same strict unknown-key and value validation. A timeline still needs a workflow state unless it is a valid typed research finding or invoice date under its matching document archetype. No state is invented to make old readers accept new data.

Older memoRABLE readers reject v2 with an unsupported-version error. They cannot open new semantic exports. Keep the original source available when exchanging with an older deployment. Existing v1 saved files remain readable without rewriting their states or payloads. The browser library stores source text, not canonical documents, so this change does not migrate stored canonical records.

The version is an interchange contract. It does not certify correct understanding or entailment. Evidence and source inspection remain required.
