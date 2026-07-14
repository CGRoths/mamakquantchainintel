# MQCHAIN U1 Build Validation

Build hash: `37f4790746f007bf3f4e66ad9868d5d8ada27b43cfe1b9c4c78730b342b106ad`
Dictionary version: `cfe03c24e185f131967c85e4f3df70be12b75f4f33867432847321ab90f10658`
Rows: 18

| Index | Items | Absent probes | Observed false-positive rate | Serialized bytes | False negatives |
|---|---:|---:|---:|---:|---:|
| address_label_current | 1 | 10000 | 0 | 415 | 0 |
| address_label_timeline | 1 | 10000 | 0 | 415 | 0 |
| metric_group_membership | 1 | 10000 | 0 | 415 | 0 |
| asset_native_namespace | 12 | 10000 | 0 | 1308 | 0 |
| asset_token_contract | 3 | 10000 | 0 | 543 | 0 |

PostgreSQL canonical-source gate, approved-batch gate, binary-key ordering, duplicate-key rejection, filter serialization round trip, and deterministic hash inputs passed.
