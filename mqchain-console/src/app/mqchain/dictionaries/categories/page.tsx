import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateCategoryForm, DeactivateCategoryForm, UpdateCategoryForm } from "@/components/mqchain/dictionary-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCategories } from "@/lib/mqchain/services/dictionary-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/dictionaries/categories?${query}` : "/mqchain/dictionaries/categories";
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const result = await listCategories(params);
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create category</CardTitle></CardHeader>
          <CardContent>
            <CreateCategoryForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Find taxonomy categories by code, name, domain, metric domain, or active state.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-6">
              <Input name="q" placeholder="ID, code, name, description" defaultValue={params.q ?? ""} />
              <Input name="domain" placeholder="Domain code" defaultValue={params.domain ?? ""} />
              <Input name="metricDomain" placeholder="Metric domain" defaultValue={params.metricDomain ?? ""} />
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
                <option value="domain">Domain</option>
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
                <a href="/mqchain/dictionaries/categories">Reset</a>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>{result.total} categories match these filters.</CardDescription>
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
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Domain</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {result.rows.map((category) => (
                <Fragment key={category.categoryId}>
                  <TableRow><TableCell className="font-mono">{category.categoryId}</TableCell><TableCell className="font-mono">{category.categoryCode}</TableCell><TableCell>{category.categoryName}</TableCell><TableCell>{category.domainCode}</TableCell><TableCell>{String(category.isActive)}</TableCell><TableCell className="text-right"><DeactivateCategoryForm id={category.categoryId} disabled={!category.isActive} /></TableCell></TableRow>
                  <TableRow>
                    <TableCell colSpan={6}>
                      <details className="rounded-md border p-3">
                        <summary className="cursor-pointer text-sm text-muted-foreground">Edit category metadata</summary>
                        <div className="pt-3">
                          <UpdateCategoryForm category={category} />
                        </div>
                      </details>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
              {!result.rows.length ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No categories match these filters.</TableCell></TableRow>
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
