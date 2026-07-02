import { DbError } from "@/components/mqchain/db-error";
import { CreateRoleForm, DeactivateRoleForm } from "@/components/mqchain/dictionary-forms";
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
              {roles.map((role) => <TableRow key={role.roleId}><TableCell className="font-mono">{role.roleId}</TableCell><TableCell className="font-mono">{role.roleCode}</TableCell><TableCell>{role.roleGroup}</TableCell><TableCell>{role.metricUsageDefault}</TableCell><TableCell className="min-w-56"><FlagBadges flags={role.defaultFlags} compact /></TableCell><TableCell>{String(role.isActive)}</TableCell><TableCell className="text-right"><DeactivateRoleForm id={role.roleId} disabled={!role.isActive} /></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
