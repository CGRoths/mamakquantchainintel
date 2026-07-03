import { Fragment } from "react";

import { DbError } from "@/components/mqchain/db-error";
import { CreateRoleForm, DeactivateRoleForm, UpdateRoleForm } from "@/components/mqchain/dictionary-forms";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function RolesPage() {
  try {
    const { roles, categories } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create role</CardTitle></CardHeader>
          <CardContent>
            <CreateRoleForm categories={categories} />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Code</TableHead><TableHead>Group</TableHead><TableHead>Metric usage</TableHead><TableHead>Flags</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {roles.map((role) => (
                <Fragment key={role.roleId}>
                  <TableRow><TableCell className="font-mono">{role.roleId}</TableCell><TableCell className="font-mono">{role.roleCode}</TableCell><TableCell>{role.roleGroup}</TableCell><TableCell>{role.metricUsageDefault}</TableCell><TableCell className="min-w-56"><FlagBadges flags={role.defaultFlags} compact /></TableCell><TableCell>{String(role.isActive)}</TableCell><TableCell className="text-right"><DeactivateRoleForm id={role.roleId} disabled={!role.isActive} /></TableCell></TableRow>
                  <TableRow>
                    <TableCell colSpan={7}>
                      <details className="rounded-md border p-3">
                        <summary className="cursor-pointer text-sm text-muted-foreground">Edit role metadata</summary>
                        <div className="pt-3">
                          <UpdateRoleForm role={role} categories={categories} />
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
