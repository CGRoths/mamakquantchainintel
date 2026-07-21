import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RuntimeDictionaryRow } from "@/lib/mqchain/contracts/runtime-dictionaries";

type Column = Readonly<{ key: string; label: string; mono?: boolean }>;

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function RuntimeDictionaryTable(props: {
  title: string;
  description: string;
  dictionaryVersion: string;
  rows: readonly RuntimeDictionaryRow[];
  columns: readonly Column[];
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div><h1 className="text-xl font-semibold">{props.title}</h1><p className="text-sm text-muted-foreground">{props.description}</p></div>
        <Badge variant="outline" className="max-w-full truncate font-mono">MQD-U1 {props.dictionaryVersion}</Badge>
      </div>
      <div className="overflow-x-auto border-y">
        <Table>
          <TableHeader><TableRow>{props.columns.map(column => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {props.rows.map((row, index) => <TableRow key={String(row.id ?? row.namespaceId ?? row.componentId ?? index)}>{props.columns.map(column => <TableCell key={column.key} className={column.mono ? "font-mono text-xs" : undefined}>{display(row[column.key])}</TableCell>)}</TableRow>)}
            {!props.rows.length ? <TableRow><TableCell colSpan={props.columns.length} className="py-8 text-center text-muted-foreground">No canonical rows.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Runtime truth: PostgreSQL. U1 CSV files remain seed and drift-comparison inputs.</p>
    </section>
  );
}
