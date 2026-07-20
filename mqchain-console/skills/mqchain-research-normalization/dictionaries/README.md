# Governed Dictionaries

Do not store a hand-maintained dictionary snapshot here. Generate the current bundle from PostgreSQL and the governed U1 catalog with:

`npm.cmd run mqchain:dictionary-bundle -- --output <directory>`

Read `manifest.json`, record its `dictionaryVersion` in every row, and match codes or names exactly. Only aliases present in the generated bundle with approved status may resolve. Unknown values remain pending and may be submitted through the governed proposal workflow; research output never creates or activates dictionary records.
