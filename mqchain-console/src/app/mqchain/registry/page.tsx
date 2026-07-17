import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { StatusBadge } from "@/components/mqchain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listRegistry } from "@/lib/mqchain/origin-client/client";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/registry?${query}` : "/mqchain/registry";
}

function registryApiHref(params: Record<string, string | undefined>, format: "json" | "csv") {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  next.set("format", format);
  return `/api/mqchain/registry?${next.toString()}`;
}

export default async function RegistryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const result = await listRegistry(params);

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Approved registry</h1>
          <p className="text-sm text-muted-foreground">Canonical truth for approved, evidence-backed address labels.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Read-only export API</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <code className="rounded-md bg-muted px-2 py-1 text-xs">/api/mqchain/registry</code>
            <Button asChild variant="outline">
              <Link href={registryApiHref(params, "json")}>Open JSON</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={registryApiHref(params, "csv")}>Export CSV</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Address" defaultValue={params.q ?? ""} />
              <Input name="chain" placeholder="Chain" defaultValue={params.chain ?? ""} />
              <Input name="entity" placeholder="Entity" defaultValue={params.entity ?? ""} />
              <Input name="protocol" placeholder="Protocol" defaultValue={params.protocol ?? ""} />
              <Input name="role" placeholder="Role" defaultValue={params.role ?? ""} />
              <Input name="category" placeholder="Category" defaultValue={params.category ?? ""} />
              <Input name="minConfidence" placeholder="Min confidence" defaultValue={params.minConfidence ?? ""} />
              <Input name="maxConfidence" placeholder="Max confidence" defaultValue={params.maxConfidence ?? ""} />
              <Input name="qualityTier" placeholder="Quality tier" defaultValue={params.qualityTier ?? ""} />
              <Input name="sourceBatch" placeholder="Batch ID" defaultValue={params.sourceBatch ?? ""} />
              <select
                name="metricEligible"
                defaultValue={params.metricEligible ?? ""}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">All metric states</option>
                <option value="true">Metric eligible</option>
                <option value="false">Metric ineligible</option>
              </select>
              <select
                name="active"
                defaultValue={params.active ?? "active"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="historical">Historical only</option>
                <option value="all">All registry states</option>
              </select>
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
                <option value="quality">Quality</option>
                <option value="address">Address</option>
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
                <Link href="/mqchain/registry">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Registry rows</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {result.total} labels | page {result.page} of {result.totalPages}
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
                  <TableHead>Entity</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map(({ registry, entityName, protocolName, roleCode, categoryCode }) => (
                  <TableRow key={registry.id}>
                    <TableCell className="font-mono">{registry.id}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">
                      <Link className="text-primary hover:underline" href={`/mqchain/registry/${registry.id}`}>
                        {registry.normalizedAddress}
                      </Link>
                    </TableCell>
                    <TableCell>{entityName}</TableCell>
                    <TableCell>{protocolName ?? "-"}</TableCell>
                    <TableCell>{roleCode}</TableCell>
                    <TableCell>{categoryCode ?? "-"}</TableCell>
                    <TableCell className="font-mono">{registry.confidenceScore}</TableCell>
                    <TableCell className="font-mono">{registry.qualityTier}</TableCell>
                    <TableCell className="min-w-48"><FlagBadges flags={registry.flags} showValue={false} showEmpty={false} compact /></TableCell>
                    <TableCell><StatusBadge status={registry.isActive ? "approved" : "superseded"} /></TableCell>
                  </TableRow>
                ))}
                {!result.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                      No registry rows match these filters.
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
