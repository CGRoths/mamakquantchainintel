import { desc, eq } from "drizzle-orm";

import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { mqKvBuilds, mqKvFilterManifests } from "@/db/schema";

export default async function KvFiltersPage() {
  try {
    const rows = await getDb().select({ filter: mqKvFilterManifests, buildHash: mqKvBuilds.buildHash })
      .from(mqKvFilterManifests).innerJoin(mqKvBuilds, eq(mqKvFilterManifests.buildId, mqKvBuilds.id))
      .orderBy(desc(mqKvFilterManifests.createdAt), desc(mqKvFilterManifests.id)).limit(250);
    return <>
      <div><h1 className="text-2xl font-semibold">Cuckoo filter health</h1><p className="text-sm text-muted-foreground">Version-matched membership filters gate KV reads; false negatives block activation.</p></div>
      <Card className="rounded-lg"><CardHeader><CardTitle>{rows.length} filter manifests</CardTitle><CardDescription>Target and observed rates are stored in parts per million.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Build</TableHead><TableHead>Index</TableHead><TableHead>Status</TableHead><TableHead>Items</TableHead><TableHead>Target</TableHead><TableHead>Observed</TableHead><TableHead>Implementation</TableHead><TableHead>Seed</TableHead><TableHead>Hash</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map(({ filter, buildHash }) => <TableRow key={filter.id}><TableCell className="max-w-44 truncate font-mono text-xs">{buildHash}</TableCell><TableCell className="font-mono text-xs">{filter.indexName}</TableCell><TableCell><StatusBadge status={filter.status} /></TableCell><TableCell className="font-mono">{filter.itemCount}</TableCell><TableCell className="font-mono">{filter.falsePositiveTargetPpm} ppm</TableCell><TableCell className="font-mono">{filter.observedFalsePositivePpm ?? "-"} ppm</TableCell><TableCell className="font-mono text-xs">{filter.implementation}@{filter.implementationVersion}</TableCell><TableCell className="font-mono text-xs">{filter.deterministicHashSeed}</TableCell><TableCell className="max-w-44 truncate font-mono text-xs">{filter.contentHash}</TableCell></TableRow>)}</TableBody>
        </Table></CardContent></Card>
    </>;
  } catch (error) {
    return <DbError error={error} />;
  }
}
