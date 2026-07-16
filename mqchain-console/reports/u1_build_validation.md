# MQCHAIN U1 Build Validation

Build hash: `af0c1145b4249f240d51c59b1e898524ca68366d9d1de06ddbeb612b7621c8e8`
Dictionary version: `cfe03c24e185f131967c85e4f3df70be12b75f4f33867432847321ab90f10658`
Rows: 15

| Index | Items | Absent probes | Observed false-positive rate | Serialized bytes | False negatives |
|---|---:|---:|---:|---:|---:|
| address_label_current | 0 | 10000 | 0 | 351 | 0 |
| address_label_timeline | 0 | 10000 | 0 | 351 | 0 |
| metric_group_membership | 0 | 10000 | 0 | 351 | 0 |
| asset_native_namespace | 12 | 10000 | 0 | 1308 | 0 |
| asset_token_contract | 3 | 10000 | 0 | 543 | 0 |

PostgreSQL canonical-source gate, approved-batch gate, binary-key ordering, duplicate-key rejection, filter serialization round trip, and deterministic hash inputs passed.
