"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createAiCleanedCsvIntakeResultAction,
  createCsvIntakeResultAction,
  createDeploymentSourceIntakeResultAction,
  createJsonEvidenceIntakeResultAction,
  createManualIntakeResultAction,
  createUrlIntakeResultAction,
  type IntakeActionState,
} from "@/app/mqchain/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CSV_UPLOAD_MAX_BYTES } from "@/lib/mqchain/csv-upload";
import { QUALITY_TIER_MAX } from "@/lib/mqchain/constants";

type IntakeAction = (previousState: IntakeActionState, formData: FormData) => Promise<IntakeActionState>;

type IntakeActionFormProps = {
  action: IntakeAction;
  children: (helpers: { fieldError: (name: string) => string | undefined }) => ReactNode;
  failureTitle: string;
  pendingLabel: string;
  submitLabel: string;
};

const initialState: IntakeActionState = null;

function FieldError({ error }: { error?: string }) {
  if (!error) {
    return null;
  }

  return <p className="text-xs text-destructive">{error}</p>;
}

function IntakeActionForm({ action, children, failureTitle, pendingLabel, submitLabel }: IntakeActionFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/mqchain/source-jobs/${state.data.sourceJobId}`);
    }
  }, [router, state]);

  function fieldError(name: string) {
    return state?.ok === false ? state.fieldErrors?.[name]?.[0] : undefined;
  }

  return (
    <form action={formAction} className="grid gap-4">
      {state?.ok === false ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{failureTitle}</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.ok ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Source job created</AlertTitle>
          <AlertDescription>
            {state.data.candidatesCreated + state.data.candidatesUpdated} candidates, {state.data.evidenceCreated} evidence rows.
          </AlertDescription>
        </Alert>
      ) : null}
      {children({ fieldError })}
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

export function ManualIntakeForm() {
  return (
    <IntakeActionForm
      action={createManualIntakeResultAction}
      failureTitle="Manual intake failed"
      pendingLabel="Creating..."
      submitLabel="Create candidates"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="manual-source-name">Source name</Label>
            <Input id="manual-source-name" name="sourceName" placeholder="Binance manual BTC reserve note" required />
            <FieldError error={fieldError("sourceName")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-source-url">Source URL</Label>
            <Input id="manual-source-url" name="sourceUrl" placeholder="https://..." />
            <FieldError error={fieldError("sourceUrl")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="manual-chain">Chain</Label>
              <Input id="manual-chain" name="chainCode" placeholder="btc" />
              <FieldError error={fieldError("chainCode")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-entity">Entity</Label>
              <Input id="manual-entity" name="entityHint" placeholder="binance" />
              <FieldError error={fieldError("entityHint")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-role">Role</Label>
              <Input id="manual-role" name="roleHint" placeholder="cex_cold_wallet" />
              <FieldError error={fieldError("roleHint")} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="manual-confidence">Confidence</Label>
              <Input id="manual-confidence" name="confidenceScore" type="number" min="0" max="100" defaultValue="60" />
              <FieldError error={fieldError("confidenceScore")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-quality">Quality tier</Label>
              <Input id="manual-quality" name="qualityTier" type="number" min="0" max={QUALITY_TIER_MAX} defaultValue="1" />
              <FieldError error={fieldError("qualityTier")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-addresses">Addresses</Label>
            <Textarea id="manual-addresses" name="addresses" rows={10} placeholder="One address per line" required />
            <FieldError error={fieldError("addresses")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-notes">Notes</Label>
            <Textarea id="manual-notes" name="notes" rows={3} placeholder="Evidence summary or operator note" />
            <FieldError error={fieldError("notes")} />
          </div>
        </>
      )}
    </IntakeActionForm>
  );
}

function CsvIntakeFields({
  fieldError,
  idPrefix,
  sourcePlaceholder,
  textPlaceholder,
}: {
  fieldError: (name: string) => string | undefined;
  idPrefix: string;
  sourcePlaceholder: string;
  textPlaceholder: string;
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-source-name`}>Source name</Label>
        <Input id={`${idPrefix}-source-name`} name="sourceName" placeholder={sourcePlaceholder} required />
        <FieldError error={fieldError("sourceName")} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-source-url`}>Source URL</Label>
        <Input id={`${idPrefix}-source-url`} name="sourceUrl" placeholder="https://..." />
        <FieldError error={fieldError("sourceUrl")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-entity`}>Entity hint</Label>
          <Input id={`${idPrefix}-entity`} name="entityHint" placeholder="coinbase" />
          <FieldError error={fieldError("entityHint")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-protocol`}>Protocol hint</Label>
          <Input id={`${idPrefix}-protocol`} name="protocolHint" placeholder="aave_v3" />
          <FieldError error={fieldError("protocolHint")} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-file`}>CSV file</Label>
        <Input id={`${idPrefix}-file`} name="csvFile" type="file" accept=".csv,.txt,text/csv,text/plain" />
        <p className="text-xs text-muted-foreground">Maximum {CSV_UPLOAD_MAX_BYTES.toLocaleString()} bytes. The file is read as text and archived as source evidence.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-text`}>CSV text</Label>
        <Textarea id={`${idPrefix}-text`} name="csvText" rows={idPrefix === "ai" ? 12 : 14} placeholder={textPlaceholder} />
        <FieldError error={fieldError("csvText")} />
      </div>
    </>
  );
}

export function CsvIntakeForm() {
  return (
    <IntakeActionForm
      action={createCsvIntakeResultAction}
      failureTitle="CSV intake failed"
      pendingLabel="Importing..."
      submitLabel="Import CSV"
    >
      {({ fieldError }) => (
        <CsvIntakeFields
          fieldError={fieldError}
          idPrefix="csv"
          sourcePlaceholder="Official exchange CSV"
          textPlaceholder={"address,chain,entity,role,confidence\nbc1...,btc,binance,cex_cold_wallet,90"}
        />
      )}
    </IntakeActionForm>
  );
}

export function UrlIntakeForm() {
  return (
    <IntakeActionForm
      action={createUrlIntakeResultAction}
      failureTitle="URL intake failed"
      pendingLabel="Fetching..."
      submitLabel="Fetch URL and stage candidates"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="url-source-name">Source name</Label>
            <Input id="url-source-name" name="sourceName" placeholder="Official deployments page" required />
            <FieldError error={fieldError("sourceName")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="url-source-url">Source URL</Label>
            <Input id="url-source-url" name="sourceUrl" placeholder="https://docs.protocol.example/deployments" required />
            <FieldError error={fieldError("sourceUrl")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="url-chain">Chain</Label>
              <Input id="url-chain" name="chainCode" placeholder="ethereum" />
              <FieldError error={fieldError("chainCode")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="url-entity">Entity</Label>
              <Input id="url-entity" name="entityHint" placeholder="aave" />
              <FieldError error={fieldError("entityHint")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="url-protocol">Protocol</Label>
              <Input id="url-protocol" name="protocolHint" placeholder="aave_v3" />
              <FieldError error={fieldError("protocolHint")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="url-role">Role</Label>
              <Input id="url-role" name="roleHint" placeholder="protocol_registry" />
              <FieldError error={fieldError("roleHint")} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="url-confidence">Confidence</Label>
              <Input id="url-confidence" name="confidenceScore" type="number" min="0" max="100" defaultValue="65" />
              <FieldError error={fieldError("confidenceScore")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="url-quality">Quality tier</Label>
              <Input id="url-quality" name="qualityTier" type="number" min="0" max={QUALITY_TIER_MAX} defaultValue="2" />
              <FieldError error={fieldError("qualityTier")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="url-notes">Notes</Label>
            <Textarea id="url-notes" name="notes" rows={3} placeholder="Official deployments page, roles need review" />
            <FieldError error={fieldError("notes")} />
          </div>
        </>
      )}
    </IntakeActionForm>
  );
}

export function JsonEvidenceIntakeForm() {
  return (
    <IntakeActionForm
      action={createJsonEvidenceIntakeResultAction}
      failureTitle="JSON evidence intake failed"
      pendingLabel="Importing..."
      submitLabel="Import JSON evidence"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="json-source-name">Source name</Label>
            <Input id="json-source-name" name="sourceName" placeholder="Deployment JSON evidence" required />
            <FieldError error={fieldError("sourceName")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="json-source-url">Source URL</Label>
            <Input id="json-source-url" name="sourceUrl" placeholder="https://..." />
            <FieldError error={fieldError("sourceUrl")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="json-chain">Chain</Label>
              <Input id="json-chain" name="chainCode" placeholder="ethereum" />
              <FieldError error={fieldError("chainCode")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="json-entity">Entity</Label>
              <Input id="json-entity" name="entityHint" placeholder="morpho" />
              <FieldError error={fieldError("entityHint")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="json-protocol">Protocol</Label>
              <Input id="json-protocol" name="protocolHint" placeholder="morpho_blue" />
              <FieldError error={fieldError("protocolHint")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="json-role">Role</Label>
              <Input id="json-role" name="roleHint" placeholder="protocol_factory" />
              <FieldError error={fieldError("roleHint")} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="json-confidence">Confidence</Label>
              <Input id="json-confidence" name="confidenceScore" type="number" min="0" max="100" defaultValue="60" />
              <FieldError error={fieldError("confidenceScore")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="json-quality">Quality tier</Label>
              <Input id="json-quality" name="qualityTier" type="number" min="0" max={QUALITY_TIER_MAX} defaultValue="1" />
              <FieldError error={fieldError("qualityTier")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="json-notes">Notes</Label>
            <Textarea id="json-notes" name="notes" rows={2} placeholder="Structured from official docs" />
            <FieldError error={fieldError("notes")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="json-text">JSON</Label>
            <Textarea
              id="json-text"
              name="jsonText"
              rows={14}
              placeholder={'[{"address":"0x...","chain":"ethereum","entity":"aave","protocol":"aave_v3","role":"aave_pool","confidence":90,"summary":"Official deployment row"}]'}
              required
            />
            <FieldError error={fieldError("jsonText")} />
          </div>
        </>
      )}
    </IntakeActionForm>
  );
}

export function DeploymentSourceIntakeForm() {
  return (
    <IntakeActionForm
      action={createDeploymentSourceIntakeResultAction}
      failureTitle="Deployment source intake failed"
      pendingLabel="Extracting..."
      submitLabel="Extract deployment candidates"
    >
      {({ fieldError }) => (
        <>
          <div className="grid gap-2">
            <Label htmlFor="deployment-source-name">Source name</Label>
            <Input id="deployment-source-name" name="sourceName" placeholder="Official protocol deployment registry" required />
            <FieldError error={fieldError("sourceName")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="deployment-source-type">Source type</Label>
              <select id="deployment-source-type" name="sourceType" defaultValue="official_url" className="h-10 rounded-md border bg-background px-3 text-sm">
                <option value="official_url">official_url</option>
                <option value="github">github</option>
                <option value="pdf">pdf_text</option>
                <option value="explorer">explorer</option>
              </select>
              <FieldError error={fieldError("sourceType")} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="deployment-source-url">Source URL</Label>
              <Input id="deployment-source-url" name="sourceUrl" placeholder="https://github.com/org/repo/blob/main/deployments.json" />
              <FieldError error={fieldError("sourceUrl")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="deployment-chain">Chain</Label>
              <Input id="deployment-chain" name="chainCode" placeholder="ethereum" />
              <FieldError error={fieldError("chainCode")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deployment-entity">Entity</Label>
              <Input id="deployment-entity" name="entityHint" placeholder="aave" />
              <FieldError error={fieldError("entityHint")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deployment-protocol">Protocol</Label>
              <Input id="deployment-protocol" name="protocolHint" placeholder="aave_v3" />
              <FieldError error={fieldError("protocolHint")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deployment-role">Fallback role</Label>
              <Input id="deployment-role" name="roleHint" placeholder="protocol_registry" />
              <FieldError error={fieldError("roleHint")} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="deployment-confidence">Confidence</Label>
              <Input id="deployment-confidence" name="confidenceScore" type="number" min="0" max="100" defaultValue="70" />
              <FieldError error={fieldError("confidenceScore")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deployment-quality">Quality tier</Label>
              <Input id="deployment-quality" name="qualityTier" type="number" min="0" max={QUALITY_TIER_MAX} defaultValue="2" />
              <FieldError error={fieldError("qualityTier")} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deployment-source-text">Source text</Label>
            <Textarea
              id="deployment-source-text"
              name="sourceText"
              rows={12}
              placeholder={"Paste HTML text, markdown table, Solidity constants, JSON deployment map, or extracted PDF text.\nPoolAddressesProvider: 0x...\n| Contract | Chain | Address |"}
            />
            <FieldError error={fieldError("sourceText")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deployment-notes">Notes</Label>
            <Textarea id="deployment-notes" name="notes" rows={2} placeholder="Official deployment registry, verify roles before batch commit" />
            <FieldError error={fieldError("notes")} />
          </div>
        </>
      )}
    </IntakeActionForm>
  );
}

export function AiCleanedCsvIntakeForm() {
  return (
    <IntakeActionForm
      action={createAiCleanedCsvIntakeResultAction}
      failureTitle="AI-cleaned CSV intake failed"
      pendingLabel="Importing..."
      submitLabel="Import AI-cleaned CSV"
    >
      {({ fieldError }) => (
        <CsvIntakeFields
          fieldError={fieldError}
          idPrefix="ai"
          sourcePlaceholder="LLM-cleaned official deployment table"
          textPlaceholder={"address,chain,role,confidence,notes\n0x...,ethereum,uniswap_v3_factory,70,LLM structured from official docs"}
        />
      )}
    </IntakeActionForm>
  );
}
