import { notFound } from "next/navigation";

import { DbError } from "@/components/mqchain/db-error";
import { ActivateKvBuildManifestForm } from "@/components/mqchain/kv-build-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildKvManifestActivationPreflight, summarizeKvManifestIndexes } from "@/lib/mqchain/kv-manifest";
import { getKvBuild } from "@/lib/mqchain/services/kv-manifest-service";

export default async function KvBuildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const build = await getKvBuild(Number(id));
    if (!build) notFound();
    const preflight = buildKvManifestActivationPreflight(build);
    const indexSummary = summarizeKvManifestIndexes(build.manifest);
    return (
      <>
        <div><h1 className="text-2xl font-semibold">KV build {build.id}</h1><p className="font-mono text-sm text-muted-foreground">{build.buildHash}</p></div>
        <section className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-lg"><CardHeader><CardTitle>Status</CardTitle></CardHeader><CardContent><StatusBadge status={build.status} /></CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Rows</CardTitle></CardHeader><CardContent className="font-mono text-2xl font-semibold">{build.rowCount}</CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Dictionary</CardTitle></CardHeader><CardContent className="truncate font-mono text-sm">{build.dictionaryVersion ?? "-"}</CardContent></Card>
          <Card className="rounded-lg"><CardHeader><CardTitle>Activated</CardTitle></CardHeader><CardContent className="font-mono text-xs">{build.activatedAt?.toISOString() ?? "-"}</CardContent></Card>
        </section>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Activation</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Activation marks this manifest as the serving artifact for downstream MQCHAIN workers. The binary build itself remains external to Vercel.</p>
            <ActivateKvBuildManifestForm buildId={build.id} canActivate={preflight.canActivate} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Activation preflight</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Check</TableHead><TableHead>Status</TableHead><TableHead>Detail</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {preflight.checks.map((check) => (
                  <TableRow key={check.key}>
                    <TableCell className="font-medium">{check.label}</TableCell>
                    <TableCell>
                      <Badge variant={check.status === "fail" ? "destructive" : check.status === "warn" ? "outline" : "secondary"}>{check.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{check.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Serving indexes</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-3 text-sm md:grid-cols-4">
              <div><span className="text-muted-foreground">Declared</span><div>{String(indexSummary.hasIndexes)}</div></div>
              <div><span className="text-muted-foreground">Required present</span><div className="font-mono">{indexSummary.rows.filter((row) => row.present).length} / {indexSummary.rows.length}</div></div>
              <div><span className="text-muted-foreground">Index rows</span><div className="font-mono">{indexSummary.totalRowCount ?? "-"}</div></div>
              <div><span className="text-muted-foreground">Missing row counts</span><div className="font-mono">{indexSummary.rowCountMissing.length}</div></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Index</TableHead><TableHead>Declared name</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead>Hash</TableHead><TableHead>Path</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {indexSummary.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="font-mono text-xs">{row.indexName}</TableCell>
                    <TableCell><Badge variant={row.present ? "secondary" : "destructive"}>{row.present ? "present" : "missing"}</Badge></TableCell>
                    <TableCell className="font-mono">{row.rowCount ?? "-"}</TableCell>
                    <TableCell className="max-w-48 truncate font-mono text-xs">{row.hash ?? "-"}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{row.path ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="rounded-lg"><CardHeader><CardTitle>Artifact</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div><span className="text-muted-foreground">Storage URI</span><div className="font-mono">{build.storageUri ?? "-"}</div></div><div><span className="text-muted-foreground">Created</span><div className="font-mono">{build.createdAt.toISOString()}</div></div></CardContent></Card>
        <Card className="rounded-lg"><CardHeader><CardTitle>Manifest</CardTitle></CardHeader><CardContent><pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(build.manifest, null, 2)}</pre></CardContent></Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
