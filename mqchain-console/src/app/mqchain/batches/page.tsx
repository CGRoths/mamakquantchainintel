import Link from "next/link";

import { CreateBatchForm } from "@/components/mqchain/batch-forms";
import { DbError } from "@/components/mqchain/db-error";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { QUALITY_TIER_MAX } from "@/lib/mqchain/constants";
import { listCandidates } from "@/lib/mqchain/services/candidate-service";
import { listBatches } from "@/lib/mqchain/services/batch-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/batches?${query}` : "/mqchain/batches";
}

function approvedCandidatePageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "approvedPage") next.set(key, value);
  }
  if (page > 1) next.set("approvedPage", String(page));
  const query = next.toString();
  return query ? `/mqchain/batches?${query}` : "/mqchain/batches";
}

function approvedCandidateFilters(params: Record<string, string | undefined>) {
  return {
    q: params.approvedQ,
    chain: params.approvedChain,
    entity: params.approvedEntity,
    protocol: params.approvedProtocol,
    role: params.approvedRole,
    sourceType: params.approvedSourceType,
    minConfidence: params.approvedMinConfidence,
    qualityTier: params.approvedQualityTier,
    status: "approved",
    sort: params.approvedSort ?? "confidence",
    page: params.approvedPage,
    pageSize: params.approvedPageSize ?? "25",
  };
}

export default async function BatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const [result, approvedResult, currentUser] = await Promise.all([
      listBatches(params),
      listCandidates(approvedCandidateFilters(params)),
      getCurrentUser(),
    ]);
    const canReview = roleCan(currentUser?.role, "candidate:review");
    const approvedCandidates = approvedResult.rows.map(({ candidate, entityName, roleCode, sourceType, sourceVerificationContext }) => ({
      id: candidate.id,
      normalizedAddress: candidate.normalizedAddress,
      chainCode: candidate.chainCode,
      confidenceScore: candidate.confidenceScore,
      qualityTier: candidate.qualityTier,
      evidenceCount: candidate.evidenceCount,
      sourceVerificationStatus: sourceVerificationContext?.status ?? null,
      sourceVerificationMessage: sourceVerificationContext?.message ?? null,
      entityName,
      roleCode,
      sourceType,
    }));

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Label batches</h1>
          <p className="text-sm text-muted-foreground">Batch approval and commit units for auditable registry writes.</p>
        </div>
        {canReview ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Create batch</CardTitle>
            <CardDescription>{approvedResult.total} approved candidates match the picker filters.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="grid gap-3 md:grid-cols-7">
              <Input name="approvedQ" placeholder="Address, hint, entity" defaultValue={params.approvedQ ?? ""} />
              <Input name="approvedChain" placeholder="Chain" defaultValue={params.approvedChain ?? ""} />
              <Input name="approvedEntity" placeholder="Entity" defaultValue={params.approvedEntity ?? ""} />
              <Input name="approvedProtocol" placeholder="Protocol" defaultValue={params.approvedProtocol ?? ""} />
              <Input name="approvedRole" placeholder="Role" defaultValue={params.approvedRole ?? ""} />
              <Input name="approvedSourceType" placeholder="Source type" defaultValue={params.approvedSourceType ?? ""} />
              <Input name="approvedMinConfidence" type="number" min="0" max="100" placeholder="Min confidence" defaultValue={params.approvedMinConfidence ?? ""} />
              <Input name="approvedQualityTier" type="number" min="0" max={QUALITY_TIER_MAX} placeholder="Quality tier" defaultValue={params.approvedQualityTier ?? ""} />
              <select
                name="approvedSort"
                defaultValue={params.approvedSort ?? "confidence"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="confidence">Confidence</option>
                <option value="created_at">Newest</option>
                <option value="evidence_count">Evidence count</option>
              </select>
              <select
                name="approvedPageSize"
                defaultValue={params.approvedPageSize ?? "25"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="25">25 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
              </select>
              <Button type="submit">Find approved</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/mqchain/batches">Reset all</Link>
              </Button>
            </form>
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Approved candidate page {approvedResult.page} of {approvedResult.totalPages}
              </span>
              <div className="flex gap-2">
                {approvedResult.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={approvedCandidatePageHref(params, approvedResult.page - 1)}>Previous</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                )}
                {approvedResult.page < approvedResult.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={approvedCandidatePageHref(params, approvedResult.page + 1)}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Next</Button>
                )}
              </div>
            </div>
            <CreateBatchForm approvedCandidates={approvedCandidates} />
          </CardContent>
        </Card>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Name, URL, hash, ID" defaultValue={params.q ?? ""} />
              <Input name="status" placeholder="pending_approval, committed..." defaultValue={params.status ?? ""} />
              <Input name="sourceType" placeholder="Source type" defaultValue={params.sourceType ?? ""} />
              <Input name="entity" placeholder="Entity ID/code/name" defaultValue={params.entity ?? ""} />
              <Input name="protocol" placeholder="Protocol ID/code/name" defaultValue={params.protocol ?? ""} />
              <Input name="role" placeholder="Role ID/code/name" defaultValue={params.role ?? ""} />
              <Input name="labelAction" placeholder="create, supersede..." defaultValue={params.labelAction ?? ""} />
              <select
                name="sort"
                defaultValue={params.sort ?? "created_at"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="created_at">Newest</option>
                <option value="updated_at">Recently updated</option>
                <option value="status">Status</option>
                <option value="accepted_count">Accepted count</option>
                <option value="committed_at">Committed time</option>
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
                <Link href="/mqchain/batches">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Batches</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {result.total} batches | page {result.page} of {result.totalPages}
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
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Default label</TableHead>
                  <TableHead>Accepted</TableHead>
                  <TableHead>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.batch.id}>
                    <TableCell className="font-mono">{row.batch.id}</TableCell>
                    <TableCell><Link className="text-primary hover:underline" href={`/mqchain/batches/${row.batch.id}`}>{row.batch.sourceName ?? `Batch ${row.batch.id}`}</Link></TableCell>
                    <TableCell><StatusBadge status={row.batch.status} /></TableCell>
                    <TableCell className="text-xs">
                      <div>{row.entity?.entityName ?? "-"}</div>
                      <div className="text-muted-foreground">{row.protocol?.protocolCode ?? "-"} / {row.role?.roleCode ?? "-"}</div>
                    </TableCell>
                    <TableCell className="font-mono">{row.batch.acceptedCount}</TableCell>
                    <TableCell className="max-w-80 truncate font-mono text-xs">{row.batch.batchHash}</TableCell>
                  </TableRow>
                ))}
                {!result.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No batches match these filters.
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
