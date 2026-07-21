import Link from "next/link";

import { DbError } from "@/components/mqchain/db-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDictionaryOverview } from "@/lib/mqchain/origin-client/client";

export default async function DictionariesPage() {
  try {
    const overview = await getDictionaryOverview();

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Dictionaries</h1>
          <p className="text-sm text-muted-foreground">Controlled vocabularies, metric universes, and dictionary-version hashes for MQCHAIN compiler handoffs.</p>
        </div>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Read-only dictionary APIs</CardTitle>
            <CardDescription>Export compiler dictionaries and the dictionary-version handoff ledger for KV workers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <code className="rounded-md bg-muted px-2 py-1 text-xs">/api/mqchain/dictionaries</code>
            <Button asChild variant="outline">
              <Link href="/api/mqchain/dictionaries">Open active JSON</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/api/mqchain/dictionaries?scope=all">Open all JSON</Link>
            </Button>
            <code className="rounded-md bg-muted px-2 py-1 text-xs">/api/mqchain/dictionaries/versions</code>
            <Button asChild variant="outline">
              <Link href="/api/mqchain/dictionaries/versions">Open versions JSON</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Current dictionary version</CardTitle>
            <CardDescription>Version hashes include entities, protocols, roles, categories, key prefixes, metric groups, and metric-group rules.</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.latestVersion ? (
              <div className="grid gap-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="break-all font-mono text-xs">{overview.latestVersion.versionHash}</div>
                  <div className="mt-2 text-muted-foreground">
                    {overview.latestVersion.createdAt.toISOString()}
                  </div>
                </div>
                <Badge variant="outline" className="font-mono">
                  {String((overview.latestVersion.summary as { reason?: unknown }).reason ?? "dictionary_changed")}
                </Badge>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No dictionary version has been recorded yet. Create or deactivate a dictionary item to mint the first hash.</div>
            )}
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overview.inventory.map((item) => (
            <Card key={item.key} className="rounded-lg">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total</span>
                    <div className="font-mono text-lg">{item.total}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Active</span>
                    <div className="font-mono text-lg">{item.active}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rules</span>
                    <div className="font-mono text-lg">{item.ruleCount ?? "-"}</div>
                  </div>
                </div>
                <Button asChild><Link href={item.href}>Open</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>U1 governed catalogs</CardTitle><CardDescription>Inspect universal networks, codecs, components, assets, standards, and honest capability status.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[
              ["Networks", "/mqchain/dictionaries/networks"], ["Namespaces", "/mqchain/dictionaries/namespaces"], ["Codecs", "/mqchain/dictionaries/codecs"], ["Components", "/mqchain/dictionaries/components"],
              ["Assets", "/mqchain/dictionaries/assets"], ["Token standards", "/mqchain/dictionaries/token-standards"], ["Coverage", "/mqchain/dictionaries/coverage"],
              ["Network support", "/mqchain/dictionaries/network-support"],
            ].map(([label, href]) => <Button key={href} asChild variant="outline"><Link href={href}>{label}</Link></Button>)}
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Dictionary versions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Hash</TableHead><TableHead>Summary</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {overview.versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{version.versionHash}</TableCell>
                    <TableCell className="text-xs">{JSON.stringify(version.summary)}</TableCell>
                    <TableCell className="font-mono text-xs">{version.createdAt.toISOString()}</TableCell>
                  </TableRow>
                ))}
                {!overview.versions.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      No dictionary versions have been recorded yet.
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
