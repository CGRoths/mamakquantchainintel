import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateEntityForm, DeactivateEntityForm, UpdateEntityForm } from "@/components/mqchain/dictionary-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function EntitiesPage() {
  try {
    const { entities, categories } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create entity</CardTitle></CardHeader>
          <CardContent>
            <CreateEntityForm categories={categories} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Entities</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {entities.map((entity) => (
                <Fragment key={entity.id}>
                  <TableRow><TableCell className="font-mono">{entity.entityCode}</TableCell><TableCell>{entity.entityName}</TableCell><TableCell>{entity.entityType}</TableCell><TableCell>{String(entity.isActive)}</TableCell><TableCell className="text-right"><DeactivateEntityForm id={entity.id} disabled={!entity.isActive} /></TableCell></TableRow>
                  <TableRow>
                    <TableCell colSpan={5}>
                      <details className="rounded-md border p-3">
                        <summary className="cursor-pointer text-sm text-muted-foreground">Edit entity metadata</summary>
                        <div className="pt-3">
                          <UpdateEntityForm entity={entity} categories={categories} />
                        </div>
                      </details>
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
