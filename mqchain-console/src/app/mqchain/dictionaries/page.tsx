import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DbError } from "@/components/mqchain/db-error";
import { listDictionaryVersions } from "@/lib/mqchain/services/dictionary-service";

const dictionaryLinks = [
  ["/mqchain/dictionaries/entities", "Entities"],
  ["/mqchain/dictionaries/protocols", "Protocols"],
  ["/mqchain/dictionaries/roles", "Roles"],
  ["/mqchain/dictionaries/categories", "Categories"],
  ["/mqchain/dictionaries/key-prefixes", "Key prefixes"],
] as const;

export default async function DictionariesPage() {
  try {
    const versions = await listDictionaryVersions();

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Dictionaries</h1>
          <p className="text-sm text-muted-foreground">Controlled vocabularies for entity, protocol, role, taxonomy, and compact key encoding.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dictionaryLinks.map(([href, label]) => (
            <Card key={href} className="rounded-lg">
              <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
              <CardContent><Button asChild><Link href={href}>Open</Link></Button></CardContent>
            </Card>
          ))}
        </div>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Dictionary versions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Hash</TableHead><TableHead>Summary</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {versions.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="max-w-96 truncate font-mono text-xs">{version.versionHash}</TableCell>
                    <TableCell className="text-xs">{JSON.stringify(version.summary)}</TableCell>
                    <TableCell className="font-mono text-xs">{version.createdAt.toISOString()}</TableCell>
                  </TableRow>
                ))}
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
