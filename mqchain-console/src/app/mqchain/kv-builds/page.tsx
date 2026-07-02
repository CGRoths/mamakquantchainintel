import Link from "next/link";

import { createKvBuildManifestAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
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
            <form action={createKvBuildManifestAction} className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="grid gap-2">
                  <Label>Build hash</Label>
                  <Input name="buildHash" placeholder="optional sha256" />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <select name="status" defaultValue="compiled" className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="compiled">compiled</option>
                    <option value="pending">pending</option>
                    <option value="failed">failed</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>Rows</Label>
                  <Input name="rowCount" type="number" min="0" defaultValue="0" />
                </div>
                <div className="grid gap-2">
                  <Label>Dictionary version</Label>
                  <Input name="dictionaryVersion" placeholder="version hash" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Storage URI</Label>
                <Input name="storageUri" placeholder="s3://bucket/mqchain-kv/buildHash or D:/mqchain-artifacts/kv/buildHash" />
              </div>
              <div className="grid gap-2">
                <Label>Manifest JSON</Label>
                <Textarea name="manifestJson" rows={8} defaultValue={'{"artifactType":"rocksdb","source":"external-worker","notes":"ready for activation after artifact verification"}'} />
              </div>
              <Button type="submit" className="w-fit">Create manifest</Button>
            </form>
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
