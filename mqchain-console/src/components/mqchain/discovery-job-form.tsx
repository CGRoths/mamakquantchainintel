"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DISCOVERY_SCANNER_TEMPLATES,
  formatDiscoveryConfigTemplate,
  getDiscoveryTemplate,
} from "@/lib/mqchain/discovery-templates";

type DiscoveryJobFormProps = {
  action: (formData: FormData) => Promise<void>;
};

export function DiscoveryJobForm({ action }: DiscoveryJobFormProps) {
  const [discoveryType, setDiscoveryType] = useState<string>(DISCOVERY_SCANNER_TEMPLATES[0].type);
  const [configJson, setConfigJson] = useState(formatDiscoveryConfigTemplate(DISCOVERY_SCANNER_TEMPLATES[0].type));
  const template = useMemo(() => getDiscoveryTemplate(discoveryType), [discoveryType]);

  function updateDiscoveryType(nextType: string) {
    setDiscoveryType(nextType);
    setConfigJson(formatDiscoveryConfigTemplate(nextType));
  }

  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="grid gap-2">
          <Label>Type</Label>
          <select
            name="discoveryType"
            value={discoveryType}
            onChange={(event) => updateDiscoveryType(event.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            required
          >
            {DISCOVERY_SCANNER_TEMPLATES.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label>Chain</Label>
          <Input name="chainCode" placeholder={template?.defaultChain ?? "ethereum"} />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label>Seed address</Label>
          <Input name="seedAddress" placeholder="0x..." />
        </div>
      </div>
      {template ? (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm md:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Root</div>
            <div className="font-medium">{template.rootType}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Evidence</div>
            <div className="font-mono text-xs">{template.evidenceType}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Required config</div>
            <div className="font-mono text-xs">{template.requiredConfig.join(", ")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Outputs</div>
            <div className="font-mono text-xs">{template.outputFields.join(", ")}</div>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Config JSON</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfigJson(formatDiscoveryConfigTemplate(discoveryType))}>
            <RotateCcw />
            Reset
          </Button>
        </div>
        <Textarea name="configJson" rows={9} value={configJson} onChange={(event) => setConfigJson(event.target.value)} />
      </div>
      <Button type="submit">Create job</Button>
    </form>
  );
}
