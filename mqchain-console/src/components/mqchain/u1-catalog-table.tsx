import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadAndValidateU1Catalog, type U1CatalogFile } from "@/lib/mqchain/catalog/u1";

export async function U1CatalogTable({
  title,
  description,
  file,
  columns,
}: {
  title: string;
  description: string;
  file: U1CatalogFile;
  columns: Array<{ key: string; label: string; mono?: boolean }>;
}) {
  const catalog = await loadAndValidateU1Catalog();
  const rows = catalog.rows.get(file) ?? [];
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>{rows.length} governed records</CardTitle>
          <CardDescription className="font-mono text-xs">{file} | dictionary {catalog.dictionaryVersion}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{columns.map(column => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${file}:${index}`}>
                  {columns.map(column => <TableCell key={column.key} className={column.mono ? "max-w-80 truncate font-mono text-xs" : "max-w-80 truncate"}>{row[column.key] || "-"}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
