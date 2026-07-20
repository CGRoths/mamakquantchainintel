import { Bot, Braces, FileCode2, FileUp, Keyboard, LinkIcon } from "lucide-react";

import {
  AiCleanedCsvIntakeForm,
  CsvIntakeForm,
  DeploymentSourceIntakeForm,
  JsonEvidenceIntakeForm,
  ManualIntakeForm,
  UrlIntakeForm,
} from "@/components/mqchain/intake-forms";
import { ResearchIntakeWorkflow } from "@/components/mqchain/research-intake-workflow";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";

export default async function NewIntakePage() {
  const currentUser = await getCurrentUser();
  const canCreateIntake = roleCan(currentUser?.role, "intake:create");

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">New intake</h1>
        <p className="text-sm text-muted-foreground">Create a source job, normalize addresses, stage candidates, and attach evidence.</p>
      </div>
      <ResearchIntakeWorkflow />
      {!canCreateIntake ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Read-only access</CardTitle>
            <CardDescription>Your role cannot create intake source jobs. Ask an analyst, admin, or owner to submit new sources.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {canCreateIntake ? (
      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Keyboard className="h-5 w-5 text-primary" /> Manual input</CardTitle>
            <CardDescription>Single or multi-line addresses. Nothing here writes to registry.</CardDescription>
          </CardHeader>
          <CardContent>
            <ManualIntakeForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5 text-primary" /> CSV upload</CardTitle>
            <CardDescription>Upload or paste bounded CSV rows. Flexible headers: address, chain, entity, protocol, role, source_url, confidence, quality_tier.</CardDescription>
          </CardHeader>
          <CardContent>
            <CsvIntakeForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LinkIcon className="h-5 w-5 text-primary" /> Source URL</CardTitle>
            <CardDescription>Fetch a public URL snapshot, extract valid addresses, and attach source-page evidence.</CardDescription>
          </CardHeader>
          <CardContent>
            <UrlIntakeForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Braces className="h-5 w-5 text-primary" /> JSON evidence</CardTitle>
            <CardDescription>Paste structured rows from a scraper, API, or evidence reviewer. Rows remain pending review.</CardDescription>
          </CardHeader>
          <CardContent>
            <JsonEvidenceIntakeForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileCode2 className="h-5 w-5 text-primary" /> Deployment source</CardTitle>
            <CardDescription>Extract deployment addresses from official docs, GitHub files, or PDF text snapshots. Rows still require review.</CardDescription>
          </CardHeader>
          <CardContent>
            <DeploymentSourceIntakeForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> AI-cleaned CSV</CardTitle>
            <CardDescription>Import LLM-cleaned rows as weak/structured evidence, never as approved truth.</CardDescription>
          </CardHeader>
          <CardContent>
            <AiCleanedCsvIntakeForm />
          </CardContent>
        </Card>
      </section>
      ) : null}
    </>
  );
}
