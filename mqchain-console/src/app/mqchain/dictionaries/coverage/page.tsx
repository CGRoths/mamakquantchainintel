import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadAndValidateU1Catalog } from "@/lib/mqchain/catalog/u1";

function tone(status: string) {
  if (status === "production_ready") return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
  if (status === "test_ready") return "border-sky-500/40 text-sky-700 dark:text-sky-300";
  if (status === "partial") return "border-amber-500/40 text-amber-700 dark:text-amber-300";
  if (status === "unsupported" || status === "disabled") return "border-rose-500/40 text-rose-700 dark:text-rose-300";
  return "text-muted-foreground";
}

export default async function CoveragePage() {
  const catalog = await loadAndValidateU1Catalog();
  const networks = catalog.rows.get("chain_networks.csv") ?? [];
  const capabilities = new Map((catalog.rows.get("chain_capabilities.csv") ?? []).map(row => [row.chain_network_id, row]));
  return (
    <>
      <div><h1 className="text-2xl font-semibold">U1 capability coverage</h1><p className="text-sm text-muted-foreground">Catalog, normalizer, KV, MQASSET, MQNODE, and metric readiness are independent claims.</p></div>
      <Card className="rounded-lg">
        <CardHeader><CardTitle>{networks.length} catalogued networks</CardTitle><CardDescription className="font-mono text-xs">dictionary {catalog.dictionaryVersion}</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Network</TableHead><TableHead>Catalog</TableHead><TableHead>Normalize</TableHead><TableHead>Current KV</TableHead><TableHead>Timeline</TableHead><TableHead>MQASSET</TableHead><TableHead>MQNODE</TableHead><TableHead>Metric</TableHead><TableHead>Reason</TableHead><TableHead>Verified</TableHead></TableRow></TableHeader>
            <TableBody>{networks.map(network => {
              const capability = capabilities.get(network.chain_network_id)!;
              const statuses = [capability.catalog_status, capability.normalizer_status, capability.current_label_status, capability.timeline_status, capability.asset_resolver_status, capability.mqnode_parser_status, capability.metric_status];
              return <TableRow key={network.chain_network_id}><TableCell><div>{network.network_name}</div><div className="font-mono text-xs text-muted-foreground">{network.network_code}</div></TableCell>
                {statuses.map((status, index) => <TableCell key={index}><Badge variant="outline" className={tone(status)}>{status}</Badge></TableCell>)}
                <TableCell className="min-w-72 text-xs text-muted-foreground">{capability.notes}</TableCell><TableCell className="font-mono text-xs">{capability.last_verified_at}</TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
