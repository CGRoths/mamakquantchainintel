import Link from "next/link";

import { createDiscoveryJobResultAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { DiscoveryJobForm } from "@/components/mqchain/discovery-job-form";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { listDiscoveryJobs } from "@/lib/mqchain/services/discovery-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/discovery/jobs?${query}` : "/mqchain/discovery/jobs";
}

export default async function DiscoveryJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const [result, currentUser] = await Promise.all([listDiscoveryJobs(params), getCurrentUser()]);
    const canCreateDiscovery = roleCan(currentUser?.role, "discovery:create");
    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Discovery jobs</h1>
          <p className="text-sm text-muted-foreground">Discovery creates candidates and evidence only. It never commits labels.</p>
        </div>
        {canCreateDiscovery ? (
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Create discovery job</CardTitle>
              <CardDescription>Factory, registry, proxy, pool, vault, tx graph, or LLM evidence reviewer worker handoffs.</CardDescription>
            </CardHeader>
            <CardContent>
              <DiscoveryJobForm action={createDiscoveryJobResultAction} />
            </CardContent>
          </Card>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Type, seed, config, logs, ID" defaultValue={params.q ?? ""} />
              <Input name="discoveryType" placeholder="factory, proxy, llm..." defaultValue={params.discoveryType ?? ""} />
              <Input name="status" placeholder="draft, completed, failed..." defaultValue={params.status ?? ""} />
              <Input name="chain" placeholder="Chain code" defaultValue={params.chain ?? ""} />
              <Input name="entity" placeholder="Entity code or name" defaultValue={params.entity ?? ""} />
              <Input name="protocol" placeholder="Protocol code or name" defaultValue={params.protocol ?? ""} />
              <Input name="seed" placeholder="Seed address" defaultValue={params.seed ?? ""} />
              <Input name="minCandidates" type="number" min="0" placeholder="Min candidates" defaultValue={params.minCandidates ?? ""} />
              <Input name="minEvidence" type="number" min="0" placeholder="Min evidence" defaultValue={params.minEvidence ?? ""} />
              <select
                name="sort"
                defaultValue={params.sort ?? "created_at"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="created_at">Newest</option>
                <option value="updated_at">Recently updated</option>
                <option value="status">Status</option>
                <option value="candidates_created">Candidates created</option>
                <option value="evidence_created">Evidence created</option>
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
                <Link href="/mqchain/discovery/jobs">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Jobs</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {result.total} discovery jobs | page {result.page} of {result.totalPages}
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
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Seed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Candidates</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map(({ job, entity, protocol }) => {
                  const scope = [
                    job.chainCode,
                    entity?.entityCode ?? (job.entityId ? `entity:${job.entityId}` : null),
                    protocol?.protocolCode ?? (job.protocolId ? `protocol:${job.protocolId}` : null),
                  ].filter(Boolean);

                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono">{job.id}</TableCell>
                      <TableCell><Link className="text-primary hover:underline" href={`/mqchain/discovery/jobs/${job.id}`}>{job.discoveryType}</Link></TableCell>
                      <TableCell className="font-mono text-xs">{scope.length ? scope.join(" / ") : "-"}</TableCell>
                      <TableCell className="max-w-64 truncate font-mono text-xs">{job.seedAddress ?? "-"}</TableCell>
                      <TableCell><StatusBadge status={job.status} /></TableCell>
                      <TableCell className="font-mono">{job.candidatesCreated}</TableCell>
                      <TableCell className="font-mono">{job.evidenceCreated}</TableCell>
                    </TableRow>
                  );
                })}
                {!result.rows.length ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No discovery jobs match these filters.</TableCell></TableRow>
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
