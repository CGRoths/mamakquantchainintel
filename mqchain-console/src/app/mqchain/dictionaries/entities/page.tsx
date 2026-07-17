import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateEntityForm, DeactivateEntityForm, UpdateEntityForm } from "@/components/mqchain/dictionary-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { listDictionaries, listEntities } from "@/lib/mqchain/origin-client/client";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/dictionaries/entities?${query}` : "/mqchain/dictionaries/entities";
}

export default async function EntitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const [result, { categories }, currentUser] = await Promise.all([listEntities(params), listDictionaries(), getCurrentUser()]);
    const canEdit = roleCan(currentUser?.role, "dictionary:edit");
    return (
      <>
        {canEdit ? (
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Create entity</CardTitle></CardHeader>
            <CardContent>
              <CreateEntityForm categories={categories} />
            </CardContent>
          </Card>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Find owners/controllers by code, name, category, type, or active state.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="Code, name, website, ID" defaultValue={params.q ?? ""} />
              <Input name="entityType" placeholder="cex, defi, custody..." defaultValue={params.entityType ?? ""} />
              <Input name="category" placeholder="Category code/name" defaultValue={params.category ?? ""} />
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
                defaultValue={params.sort ?? "name"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="name">Name</option>
                <option value="code">Code</option>
                <option value="type">Type</option>
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
                <a href="/mqchain/dictionaries/entities">Reset</a>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Entities</CardTitle>
            <CardDescription>{result.total} entities match these filters.</CardDescription>
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
            <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {result.rows.map(({ entity, category }) => (
                <Fragment key={entity.id}>
                  <TableRow>
                    <TableCell className="font-mono">{entity.entityCode}</TableCell>
                    <TableCell>{entity.entityName}</TableCell>
                    <TableCell>{entity.entityType}</TableCell>
                    <TableCell>{category?.categoryCode ?? entity.categoryId ?? "-"}</TableCell>
                    <TableCell>{String(entity.isActive)}</TableCell>
                    <TableCell className="text-right">{canEdit ? <DeactivateEntityForm id={entity.id} disabled={!entity.isActive} /> : null}</TableCell>
                  </TableRow>
                  {canEdit ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <details className="rounded-md border p-3">
                          <summary className="cursor-pointer text-sm text-muted-foreground">Edit entity metadata</summary>
                          <div className="pt-3">
                            <UpdateEntityForm entity={entity} categories={categories} />
                          </div>
                        </details>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
              {!result.rows.length ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No entities match these filters.</TableCell></TableRow>
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
