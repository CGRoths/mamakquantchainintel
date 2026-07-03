import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSourceJobs } from "@/lib/mqchain/services/source-job-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/source-jobs?${query}` : "/mqchain/source-jobs";
}

export default async function SourceJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const result = await listSourceJobs(params);

    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Source jobs</h1>
            <p className="text-sm text-muted-foreground">Intake metadata, parser status, archived source documents, and import summaries.</p>
          </div>
          <Button asChild><Link href="/mqchain/intake/new">New intake</Link></Button>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Source, URL, file, archive" defaultValue={params.q ?? ""} />
              <Input name="sourceType" placeholder="csv_upload, official_url..." defaultValue={params.sourceType ?? ""} />
              <Input name="status" placeholder="candidate_created, failed..." defaultValue={params.status ?? ""} />
              <Input name="entity" placeholder="Entity hint" defaultValue={params.entity ?? ""} />
              <Input name="protocol" placeholder="Protocol hint" defaultValue={params.protocol ?? ""} />
              <Input name="chain" placeholder="Chain scope" defaultValue={params.chain ?? ""} />
              <select
                name="sort"
                defaultValue={params.sort ?? "created_at"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="created_at">Newest</option>
                <option value="updated_at">Recently updated</option>
                <option value="source_type">Source type</option>
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
                <Link href="/mqchain/source-jobs">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Source jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {result.total} source jobs | page {result.page} of {result.totalPages}
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((job) => {
                  const metadata = job.metadata as Record<string, unknown>;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono">{job.id}</TableCell>
                      <TableCell>
                        <Link className="text-primary hover:underline" href={`/mqchain/source-jobs/${job.id}`}>{job.sourceName ?? "Untitled source"}</Link>
                        <span className="block max-w-96 truncate text-xs text-muted-foreground">{job.sourceUrl ?? job.archiveStorageUri ?? "-"}</span>
                      </TableCell>
                      <TableCell>{job.sourceType}</TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell className="font-mono text-xs">
                        rows {String(metadata.totalRows ?? 0)} / created {String(metadata.candidatesCreated ?? 0)} / invalid {String(metadata.invalidAddresses ?? 0)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{job.createdAt.toISOString()}</TableCell>
                    </TableRow>
                  );
                })}
                {!result.rows.length ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No source jobs match these filters.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
