import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateRoleForm, DeactivateRoleForm, UpdateRoleForm } from "@/components/mqchain/dictionary-forms";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { QUALITY_TIER_MAX } from "@/lib/mqchain/constants";
import { listDictionaries, listRoles } from "@/lib/mqchain/origin-client/client";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/dictionaries/roles?${query}` : "/mqchain/dictionaries/roles";
}

export default async function RolesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const [result, { categories }, currentUser] = await Promise.all([listRoles(params), listDictionaries(), getCurrentUser()]);
    const canEdit = roleCan(currentUser?.role, "dictionary:edit");
    return (
      <>
        {canEdit ? (
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Create role</CardTitle></CardHeader>
            <CardContent>
              <CreateRoleForm categories={categories} />
            </CardContent>
          </Card>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Find KV roles by category, group, metric usage, boundary class, quality, or active state.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-7">
              <Input name="q" placeholder="ID, code, name, flags" defaultValue={params.q ?? ""} />
              <Input name="category" placeholder="Category code/name" defaultValue={params.category ?? ""} />
              <Input name="roleGroup" placeholder="Role group" defaultValue={params.roleGroup ?? ""} />
              <Input name="metricUsage" placeholder="Metric usage" defaultValue={params.metricUsage ?? ""} />
              <Input name="boundary" placeholder="Boundary class" defaultValue={params.boundary ?? ""} />
              <Input name="minQuality" type="number" min="0" max={QUALITY_TIER_MAX} placeholder="Min quality" defaultValue={params.minQuality ?? ""} />
              <Input name="maxQuality" type="number" min="0" max={QUALITY_TIER_MAX} placeholder="Max quality" defaultValue={params.maxQuality ?? ""} />
              <select
                name="active"
                defaultValue={params.active ?? "active"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All states</option>
              </select>
              <select
                name="sort"
                defaultValue={params.sort ?? "id"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="id">ID</option>
                <option value="code">Code</option>
                <option value="name">Name</option>
                <option value="group">Group</option>
                <option value="quality">Quality</option>
                <option value="created_at">Newest</option>
                <option value="updated_at">Recently updated</option>
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
                <a href="/mqchain/dictionaries/roles">Reset</a>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <CardDescription>{result.total} roles match these filters.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Page {result.page} of {result.totalPages}
              </span>
              <div className="flex gap-2">
                {result.page > 1 ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={pageHref(params, result.page - 1)}>Previous</a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                )}
                {result.page < result.totalPages ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={pageHref(params, result.page + 1)}>Next</a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Next</Button>
                )}
              </div>
            </div>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Code</TableHead><TableHead>Category</TableHead><TableHead>Group</TableHead><TableHead>Metric usage</TableHead><TableHead>Quality</TableHead><TableHead>Flags</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {result.rows.map(({ role, category }) => (
                <Fragment key={role.roleId}>
                  <TableRow><TableCell className="font-mono">{role.roleId}</TableCell><TableCell className="font-mono">{role.roleCode}</TableCell><TableCell>{category?.categoryCode ?? role.categoryId ?? "-"}</TableCell><TableCell>{role.roleGroup}</TableCell><TableCell>{role.metricUsageDefault}</TableCell><TableCell>{role.defaultQualityTier}</TableCell><TableCell className="min-w-56"><FlagBadges flags={role.defaultFlags} compact /></TableCell><TableCell>{String(role.isActive)}</TableCell><TableCell className="text-right">{canEdit ? <DeactivateRoleForm id={role.roleId} disabled={!role.isActive} /> : null}</TableCell></TableRow>
                  {canEdit ? (
                    <TableRow>
                      <TableCell colSpan={9}>
                        <details className="rounded-md border p-3">
                          <summary className="cursor-pointer text-sm text-muted-foreground">Edit role metadata</summary>
                          <div className="pt-3">
                            <UpdateRoleForm role={role} categories={categories} />
                          </div>
                        </details>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
              {!result.rows.length ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No roles match these filters.</TableCell></TableRow>
              ) : null}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
