import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateProtocolForm, DeactivateProtocolForm, UpdateProtocolForm } from "@/components/mqchain/dictionary-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDictionaries, listProtocols } from "@/lib/mqchain/services/dictionary-service";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/dictionaries/protocols?${query}` : "/mqchain/dictionaries/protocols";
}

export default async function ProtocolsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const [result, { entities }] = await Promise.all([listProtocols(params), listDictionaries()]);
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create protocol</CardTitle></CardHeader>
          <CardContent>
            <CreateProtocolForm entities={entities} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Find protocols by owner, code, chain scope, type, or active state.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-7">
              <Input name="q" placeholder="Code, name, chain, ID" defaultValue={params.q ?? ""} />
              <Input name="entity" placeholder="Owner entity" defaultValue={params.entity ?? ""} />
              <Input name="protocolType" placeholder="lending, dex..." defaultValue={params.protocolType ?? ""} />
              <Input name="chain" placeholder="ethereum, base..." defaultValue={params.chain ?? ""} />
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
                <option value="entity">Owner</option>
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
                <a href="/mqchain/dictionaries/protocols">Reset</a>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Protocols</CardTitle>
            <CardDescription>{result.total} protocols match these filters.</CardDescription>
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
            <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Owner</TableHead><TableHead>Type</TableHead><TableHead>Chains</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {result.rows.map(({ protocol, entity }) => (
                <Fragment key={protocol.id}>
                  <TableRow><TableCell className="font-mono">{protocol.protocolCode}</TableCell><TableCell>{protocol.protocolName}</TableCell><TableCell>{entity?.entityCode ?? protocol.entityId ?? "-"}</TableCell><TableCell>{protocol.protocolType}</TableCell><TableCell>{protocol.chainScope?.join(", ")}</TableCell><TableCell>{String(protocol.isActive)}</TableCell><TableCell className="text-right"><DeactivateProtocolForm id={protocol.id} disabled={!protocol.isActive} /></TableCell></TableRow>
                  <TableRow>
                    <TableCell colSpan={7}>
                      <details className="rounded-md border p-3">
                        <summary className="cursor-pointer text-sm text-muted-foreground">Edit protocol metadata</summary>
                        <div className="pt-3">
                          <UpdateProtocolForm protocol={protocol} entities={entities} />
                        </div>
                      </details>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
              {!result.rows.length ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No protocols match these filters.</TableCell></TableRow>
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
