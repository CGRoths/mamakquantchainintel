import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCandidates } from "@/lib/mqchain/services/candidate-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/candidates?${query}` : "/mqchain/candidates";
}

function candidateApiHref(params: Record<string, string | undefined>, format: "json" | "csv") {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  next.set("format", format);
  return `/api/mqchain/candidates?${next.toString()}`;
}

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const result = await listCandidates(params);

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Candidates</h1>
          <p className="text-sm text-muted-foreground">Normalized, unapproved address intelligence awaiting review, rejection, or batching.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Read-only staging API</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <code className="rounded-md bg-muted px-2 py-1 text-xs">/api/mqchain/candidates</code>
            <Button asChild variant="outline">
              <Link href={candidateApiHref(params, "json")}>Open JSON</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={candidateApiHref(params, "csv")}>Export CSV</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Address or entity" defaultValue={params.q ?? ""} />
              <Input name="chain" placeholder="btc, ethereum..." defaultValue={params.chain ?? ""} />
              <Input name="entity" placeholder="Entity" defaultValue={params.entity ?? ""} />
              <Input name="protocol" placeholder="Protocol" defaultValue={params.protocol ?? ""} />
              <Input name="role" placeholder="Role" defaultValue={params.role ?? ""} />
              <Input name="status" placeholder="Status" defaultValue={params.status ?? ""} />
              <Input name="sourceType" placeholder="Source type" defaultValue={params.sourceType ?? ""} />
              <Input name="discoveryType" placeholder="Discovery type" defaultValue={params.discoveryType ?? ""} />
              <Input name="minConfidence" placeholder="Min confidence" defaultValue={params.minConfidence ?? ""} />
              <Input name="maxConfidence" placeholder="Max confidence" defaultValue={params.maxConfidence ?? ""} />
              <Input name="qualityTier" placeholder="Quality tier" defaultValue={params.qualityTier ?? ""} />
              <select
                name="conflicts"
                defaultValue={params.conflicts ?? ""}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">All conflict states</option>
                <option value="true">Conflicts only</option>
                <option value="false">Ignore conflict filter</option>
              </select>
              <select
                name="sort"
                defaultValue={params.sort ?? "created_at"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="created_at">Newest</option>
                <option value="confidence">Confidence</option>
                <option value="evidence_count">Evidence count</option>
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
                <Link href="/mqchain/candidates">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Candidate table</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {result.total} candidates | page {result.page} of {result.totalPages}
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
                  <TableHead>Address</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map(({ candidate, entityName, roleCode, sourceType }) => (
                  <TableRow key={candidate.id}>
                    <TableCell className="font-mono">{candidate.id}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">
                      <Link className="text-primary hover:underline" href={`/mqchain/candidates/${candidate.id}`}>
                        {candidate.normalizedAddress}
                      </Link>
                    </TableCell>
                    <TableCell>{candidate.chainCode}</TableCell>
                    <TableCell>{entityName ?? candidate.entityHint ?? "-"}</TableCell>
                    <TableCell>{roleCode ?? candidate.roleHint ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{sourceType ?? candidate.discoveredBy}</TableCell>
                    <TableCell><StatusBadge status={candidate.candidateStatus} /></TableCell>
                    <TableCell className="font-mono">{candidate.confidenceScore}</TableCell>
                  </TableRow>
                ))}
                {!result.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No candidates match these filters.
                    </TableCell>
                  </TableRow>
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
