import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { CreateKvBuildManifestForm } from "@/components/mqchain/kv-build-forms";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { listKvBuilds } from "@/lib/mqchain/services/kv-manifest-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/kv-builds?${query}` : "/mqchain/kv-builds";
}

export default async function KvBuildsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const [result, currentUser] = await Promise.all([listKvBuilds(params), getCurrentUser()]);
    const canCommit = roleCan(currentUser?.role, "batch:commit");
    return (
      <>
        <div><h1 className="text-2xl font-semibold">KV build manifests</h1><p className="text-sm text-muted-foreground">RocksDB compilation is external; the console tracks manifests and batch handoffs.</p></div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Active serving manifest</CardTitle>
            <CardDescription>Authenticated read-only endpoint for MamakQuantNode and external KV workers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <code className="rounded-md bg-muted px-2 py-1 text-xs">/api/mqchain/kv-builds/active</code>
            <Button asChild variant="outline">
              <Link href="/api/mqchain/kv-builds/active">Open JSON</Link>
            </Button>
          </CardContent>
        </Card>
        {canCommit ? (
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Register external build</CardTitle>
              <CardDescription>Record a worker-produced JSONL/RocksDB artifact without compiling inside Vercel.</CardDescription>
            </CardHeader>
            <CardContent>
              <CreateKvBuildManifestForm />
            </CardContent>
          </Card>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Hash, dictionary, storage, ID" defaultValue={params.q ?? ""} />
              <Input name="status" placeholder="pending, compiled, active..." defaultValue={params.status ?? ""} />
              <Input name="dictionaryVersion" placeholder="Dictionary version" defaultValue={params.dictionaryVersion ?? ""} />
              <Input name="storage" placeholder="Storage URI" defaultValue={params.storage ?? ""} />
              <Input name="minRows" type="number" min="0" placeholder="Min rows" defaultValue={params.minRows ?? ""} />
              <Input name="maxRows" type="number" min="0" placeholder="Max rows" defaultValue={params.maxRows ?? ""} />
              <select
                name="sort"
                defaultValue={params.sort ?? "created_at"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="created_at">Newest</option>
                <option value="activated_at">Activated time</option>
                <option value="row_count">Row count</option>
                <option value="status">Status</option>
              </select>
              <select
                name="pageSize"
                defaultValue={params.pageSize ?? "50"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
              <Button type="submit">Search</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/mqchain/kv-builds">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Builds</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {result.total} manifests | page {result.page} of {result.totalPages}
              </span>
              <div className="flex gap-2">
                {result.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(params, result.page - 1)}>Previous</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                )}
                {result.page < result.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(params, result.page + 1)}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Next</Button>
                )}
              </div>
            </div>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Hash</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead><TableHead>Storage</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>
              {result.rows.map((build) => <TableRow key={build.id}><TableCell className="font-mono">{build.id}</TableCell><TableCell className="max-w-80 truncate font-mono text-xs"><Link className="text-primary hover:underline" href={`/mqchain/kv-builds/${build.id}`}>{build.buildHash}</Link></TableCell><TableCell><StatusBadge status={build.status} /></TableCell><TableCell className="font-mono">{build.rowCount}</TableCell><TableCell className="max-w-72 truncate font-mono text-xs">{build.storageUri ?? "-"}</TableCell><TableCell className="font-mono text-xs">{build.createdAt.toISOString()}</TableCell></TableRow>)}
              {!result.rows.length ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No KV build manifests match these filters.</TableCell></TableRow> : null}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
