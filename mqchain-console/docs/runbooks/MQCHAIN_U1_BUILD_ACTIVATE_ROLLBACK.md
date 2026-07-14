# MQCHAIN U1 Build, Activate, and Rollback

## Build

1. Confirm migrations and catalog validation are green.
2. Freeze the dictionary version and last committed batch ID.
3. Compile binary-key-sorted current, timeline, metric-group, native-asset, and token artifacts.
4. Build and serialize matching filters.
5. Verify hashes, inserted-key membership, absent-key sample rate, interval integrity, and registry/batch provenance.

## Activate

Activate only a complete compatible manifest set. The transaction marks the new build active and the previous build retained/superseded without deleting artifacts. A failed validation leaves the prior build active.

## Rollback

Select the retained prior compatible build, revalidate its manifests and storage objects, then atomically reactivate it. Record the actor, reason, before/after build IDs, and timestamp in the audit log. Never edit artifact contents in place.
