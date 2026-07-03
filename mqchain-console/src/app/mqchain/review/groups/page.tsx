import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReviewGroupsWorkspace } from "@/lib/mqchain/services/review-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/review/groups?${query}` : "/mqchain/review/groups";
}

export default async function ReviewGroupsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const workspace = await getReviewGroupsWorkspace(params);

    return (
      <>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Review groups</h1>
            <p className="text-sm text-muted-foreground">Entity, chain, and role groupings for batch-oriented review.</p>
          </div>
          <Button asChild variant="outline"><Link href="/mqchain/review">Review queue</Link></Button>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Group pending candidates by entity, chain, and role before batch review.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Group, slug, candidate ID" defaultValue={params.q ?? ""} />
              <Input name="chain" placeholder="Chain" defaultValue={params.chain ?? ""} />
              <Input name="entity" placeholder="Entity" defaultValue={params.entity ?? ""} />
              <Input name="role" placeholder="Role" defaultValue={params.role ?? ""} />
              <Input name="sourceType" placeholder="Source type" defaultValue={params.sourceType ?? ""} />
              <Input name="discoveryType" placeholder="Discovery type" defaultValue={params.discoveryType ?? ""} />
              <Input name="minConfidence" type="number" min="0" max="100" placeholder="Min avg confidence" defaultValue={params.minConfidence ?? ""} />
              <Input name="minCount" type="number" min="1" placeholder="Min rows" defaultValue={params.minCount ?? ""} />
              <Input name="minEvidence" type="number" min="0" placeholder="Min evidence" defaultValue={params.minEvidence ?? ""} />
              <select
                name="sort"
                defaultValue={params.sort ?? "count"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="count">Largest groups</option>
                <option value="confidence">Avg confidence</option>
                <option value="evidence">Evidence rows</option>
                <option value="entity">Entity</option>
              </select>
              <select
                name="pageSize"
                defaultValue={params.pageSize ?? "50"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="25">25 groups</option>
                <option value="50">50 groups</option>
                <option value="100">100 groups</option>
              </select>
              <Button type="submit">Search</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/mqchain/review/groups">Reset</Link>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Candidate groups</CardTitle>
            <CardDescription>
              {workspace.rows.length} pending candidates across {workspace.allGroups.length} groups; {workspace.total} groups match these filters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Page {workspace.page} of {workspace.totalPages}
              </span>
              <div className="flex gap-2">
                {workspace.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(params, workspace.page - 1)}>Previous</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                )}
                {workspace.page < workspace.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={pageHref(params, workspace.page + 1)}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Next</Button>
                )}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Avg confidence</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Candidate IDs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.groups.map((group) => (
                  <TableRow key={group.slug}>
                    <TableCell>
                      <Button asChild variant="link" className="h-auto p-0 text-left">
                        <Link href={`/mqchain/review/groups/${group.slug}`}>
                          <span className="block">{group.entity}</span>
                          <span className="block font-mono text-xs text-muted-foreground">{group.chain} / {group.role}</span>
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono">{group.count}</TableCell>
                    <TableCell className="font-mono">{group.averageConfidence}</TableCell>
                    <TableCell className="font-mono">{group.evidenceCount}</TableCell>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{group.candidateIds.join(", ")}</TableCell>
                  </TableRow>
                ))}
                {!workspace.groups.length ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No pending review groups match these filters.</TableCell></TableRow>
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
