# MQCHAIN U1 Build Validation

Build hash: `208f12ce1bbf15272bbf289859cf617809defd98cc15872be749e730261f4c10`
Dictionary version: `f8adbdf28418e119001751be4dbf90c14aff48750699ad5f61634e7a002caf06`
Rows: 15

| Index | Items | Absent probes | Observed false-positive rate | Serialized bytes | False negatives |
|---|---:|---:|---:|---:|---:|
| address_label_current | 0 | 10000 | 0 | 351 | 0 |
| address_label_timeline | 0 | 10000 | 0 | 351 | 0 |
| metric_group_membership | 0 | 10000 | 0 | 351 | 0 |
| asset_native_namespace | 12 | 10000 | 0 | 1308 | 0 |
| asset_token_contract | 3 | 10000 | 0 | 543 | 0 |

PostgreSQL canonical-source gate, approved-batch gate, binary-key ordering, duplicate-key rejection, filter serialization round trip, and deterministic hash inputs passed.
