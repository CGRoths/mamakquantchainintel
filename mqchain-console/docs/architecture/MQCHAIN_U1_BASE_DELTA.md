# MQCHAIN U1 Base and Delta Builds

A base build is an immutable complete snapshot at `last_committed_batch_id`. A delta build references either `base_build_id` or `delta_parent_build_id` and contains changed, added, removed, or deprecated keys since its parent.

Resolution order is newest delta to oldest delta, then base. Explicit tombstone or removed membership values stop fallback so deleted state cannot reappear from base. Address timeline intervals remain immutable historical rows.

Activation is atomic across manifest state. Exactly one compatible build chain is active. The previous active chain is retained for rollback. Activation validates dictionary version, schemas, content hashes, filter round-trips, parent linkage, and absence of false negatives.

Compaction creates a new base from canonical PostgreSQL truth; it does not mutate the previous base or deltas.
