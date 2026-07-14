# MQCHAIN U1 ID Allocation

IDs are append-only unsigned identifiers. They are never reused, compacted, or silently renumbered. Inactive rows retain IDs forever. Catalog import rejects a code whose explicit ID disagrees with the database and reports the conflict.

Observed legacy allocations are reserved exactly:

- Categories: IDs 100-920 currently assigned to 17 codes.
- Entities: IDs 1-31 currently assigned.
- Protocols: IDs 1-13 currently assigned.
- Roles: IDs 1000-6050 currently assigned to 55 codes.
- Prefixes: legacy uint16 values remain frozen for compatibility.

New allocations are registered in `mq_dictionary_id_ranges`. U1 additions use disjoint owner-domain ranges, with `next_id` advanced transactionally. Explicit catalog IDs are mandatory; insertion order is never an allocator.

When a proposed range overlaps a live ID, preserve the live row, register that exception, and emit a conflict. Review is required before changing a range boundary.
