import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateKeyPrefixForm, DeactivateKeyPrefixForm, UpdateKeyPrefixForm } from "@/components/mqchain/dictionary-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { listKeyPrefixes } from "@/lib/mqchain/origin-client/client";

function pageHref(params: Record<string, string | undefined>, page: number) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value);
  }
  if (page > 1) next.set("page", String(page));
  const query = next.toString();
  return query ? `/mqchain/dictionaries/key-prefixes?${query}` : "/mqchain/dictionaries/key-prefixes";
}

export default async function KeyPrefixesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;

  try {
    const [result, currentUser] = await Promise.all([listKeyPrefixes(params), getCurrentUser()]);
    const canEdit = roleCan(currentUser?.role, "dictionary:edit");
    return (
      <>
        {canEdit ? (
          <Card className="rounded-lg">
            <CardHeader><CardTitle>Create key prefix</CardTitle></CardHeader>
            <CardContent>
              <CreateKeyPrefixForm />
            </CardContent>
          </Card>
        ) : null}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Find resolver/KV prefixes by chain, family, codec, EVM chain ID, payload length, or active state.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-7">
              <Input name="q" placeholder="Prefix, chain, codec, ID" defaultValue={params.q ?? ""} />
              <Input name="chain" placeholder="Chain code/name" defaultValue={params.chain ?? ""} />
              <Input name="chainFamily" placeholder="evm, bitcoin..." defaultValue={params.chainFamily ?? ""} />
              <Input name="addressFamily" placeholder="evm20, btc_bech32..." defaultValue={params.addressFamily ?? ""} />
              <Input name="codec" placeholder="hex, bech32..." defaultValue={params.codec ?? ""} />
              <Input name="evmChainId" type="number" min="1" placeholder="EVM chain ID" defaultValue={params.evmChainId ?? ""} />
              <Input name="minPayloadLen" type="number" min="1" placeholder="Min length" defaultValue={params.minPayloadLen ?? ""} />
              <Input name="maxPayloadLen" type="number" min="1" placeholder="Max length" defaultValue={params.maxPayloadLen ?? ""} />
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
                defaultValue={params.sort ?? "prefix"}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="prefix">Prefix</option>
                <option value="chain">Chain</option>
                <option value="chain_family">Chain family</option>
                <option value="address_family">Address family</option>
                <option value="codec">Codec</option>
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
                <a href="/mqchain/dictionaries/key-prefixes">Reset</a>
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Key prefixes</CardTitle>
            <CardDescription>{result.total} key prefixes match these filters.</CardDescription>
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
            <Table><TableHeader><TableRow><TableHead>Prefix</TableHead><TableHead>Chain</TableHead><TableHead>Family</TableHead><TableHead>Codec</TableHead><TableHead>Length</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {result.rows.map((prefix) => (
                <Fragment key={prefix.prefixCode}>
                  <TableRow><TableCell className="font-mono">0x{prefix.prefixCode.toString(16).padStart(4, "0")}</TableCell><TableCell>{prefix.chainCode}</TableCell><TableCell>{prefix.addressFamily}</TableCell><TableCell>{prefix.codec}</TableCell><TableCell className="font-mono">{prefix.payloadLen ?? "var"}</TableCell><TableCell>{String(prefix.isActive)}</TableCell><TableCell className="text-right">{canEdit ? <DeactivateKeyPrefixForm id={prefix.prefixCode} disabled={!prefix.isActive} /> : null}</TableCell></TableRow>
                  {canEdit ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <details className="rounded-md border p-3">
                          <summary className="cursor-pointer text-sm text-muted-foreground">Edit key prefix metadata</summary>
                          <div className="pt-3">
                            <UpdateKeyPrefixForm prefix={prefix} />
                          </div>
                        </details>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
              {!result.rows.length ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No key prefixes match these filters.</TableCell></TableRow>
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
