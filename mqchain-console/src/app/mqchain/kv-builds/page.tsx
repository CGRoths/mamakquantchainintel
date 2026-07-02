import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { CreateKvBuildManifestForm } from "@/components/mqchain/kv-build-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listKvBuilds } from "@/lib/mqchain/services/kv-manifest-service";

export default async function KvBuildsPage() {
  try {
    const builds = await listKvBuilds();
    return (
      <>
        <div><h1 className="text-2xl font-semibold">KV build manifests</h1><p className="text-sm text-muted-foreground">RocksDB compilation is external; the console tracks manifests and batch handoffs.</p></div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Register external build</CardTitle>
            <CardDescription>Record a worker-produced JSONL/RocksDB artifact without compiling inside Vercel.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateKvBuildManifestForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Builds</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Hash</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead>Storage</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>
              {builds.map((build) => <TableRow key={build.id}><TableCell className="font-mono">{build.id}</TableCell><TableCell className="max-w-80 truncate font-mono text-xs"><Link className="text-primary hover:underline" href={`/mqchain/kv-builds/${build.id}`}>{build.buildHash}</Link></TableCell><TableCell><StatusBadge status={build.status} /></TableCell><TableCell className="font-mono">{build.rowCount}</TableCell><TableCell className="max-w-72 truncate font-mono text-xs">{build.storageUri ?? "-"}</TableCell><TableCell className="font-mono text-xs">{build.createdAt.toISOString()}</TableCell></TableRow>)}
              {!builds.length ? <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">No KV build manifests yet.</TableCell></TableRow> : null}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
