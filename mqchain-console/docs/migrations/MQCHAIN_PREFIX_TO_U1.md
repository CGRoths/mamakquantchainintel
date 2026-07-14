# Prefix to U1 Additive Migration

1. Create U1 network, codec, namespace, governance, MQASSET, and filter tables.
2. Add nullable `namespace_id` and `address_codec_id` to candidates, registry, and metric membership.
3. Seed an explicit mapping from each frozen `prefix_code` to one namespace and codec.
4. Backfill only rows with one valid mapping and codec-compatible payload.
5. Retain the prefix table and compatibility adapter for existing readers.
6. In dual-validation mode, encode both V1 and U1 identities and require both to represent the same normalized address.
7. Write unmapped, ambiguous, payload-invalid, or ID-conflicting rows to the migration conflict report.

No U1 migration drops prefix columns or rewrites existing dictionary IDs. Retirement requires a future separately approved migration after parity, rollout, and rollback evidence.
