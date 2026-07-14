# MQCHAIN U1 Catalog Governance

Checked-in catalogs under `data/catalog/u1` are canonicalized as UTF-8 with LF endings, fixed columns, lowercase canonical codes, deterministic ID order, and no duplicate IDs or codes. A dictionary version is the SHA-256 hash of canonical catalog filenames and canonical content.

Every substantive claim carries a catalog source ID, retrieval or verification date when available, and notes. Official contract addresses and token identifiers require an authoritative source. Missing, ambiguous, or unsupported values remain absent and appear in coverage reports; they are never guessed.

Catalog validation rejects broken foreign keys, parent cycles, unknown role categories, unsupported production-ready claims, invalid namespace/codec pairs, duplicate normalized keys, and source-less official claims. Database reconciliation is code-and-ID stable and transactional.

Changes are reviewed as data changes. Deactivation is additive; rows and IDs are retained. Raw source documents are content-addressed in archive/object storage and referenced from provenance rather than duplicated per address.
