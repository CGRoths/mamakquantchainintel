# MQCHAIN U1 Binary Layout

All key ordering integers are unsigned big-endian. All compact value integers wider than one byte are unsigned little-endian. Encoders reject overflow, unsafe numeric conversion, malformed hex, and codec-incompatible payload lengths. Decoders reject every unexpected value length.

| Contract | Layout |
| --- | --- |
| MQK-U1 | `namespace_id:u32BE + codec_id:u16BE + payload` |
| MQV-U1 | 56 bytes: `version:u8, status:u8, quality:u8, confidence:u8, entity:u32LE, protocol:u32LE, category:u32LE, role:u32LE, component:u32LE, tagset:u32LE, flags:u32LE, batch:u64LE, first_seen:u64LE, last_seen:u64LE` |
| MQT-Key-U1 | `MQK-U1 + valid_from:u64BE` |
| MQT-U1 | 64 bytes: MQV first 40 bytes, then `valid_to:u64LE, first_seen:u64LE, last_seen:u64LE` |
| MQG-Key-U1 | `metric_group_id:u32BE + MQK-U1` |
| MQG-U1 | 24 bytes: `version:u8, membership_status:u8, confidence:u8, reserved:u8, entity:u32LE, category:u32LE, role:u32LE, flags:u32LE, tagset:u32LE` |
| MQA-Key-U1 | `namespace_id:u32BE + codec_id:u16BE + token payload` |
| MQA-U1 | 48 bytes per the approved U1 asset-token contract |
| MQAN-Key-U1 | `namespace_id:u32BE` |
| MQAN-U1 | 16 bytes per the approved U1 native-asset contract |

Zero is the null sentinel for optional dictionary pointers and optional heights. It never authorizes a missing required identity. Schema version is `1` for U1.
