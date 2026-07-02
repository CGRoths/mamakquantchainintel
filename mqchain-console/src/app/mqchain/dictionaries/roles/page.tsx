import { createRoleAction, deactivateRoleAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { FlagBadges } from "@/components/mqchain/flag-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function RolesPage() {
  try {
    const { roles, categories } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create role</CardTitle></CardHeader>
          <CardContent>
            <form action={createRoleAction} className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-2"><Label>ID</Label><Input name="roleId" type="number" required /></div>
              <div className="grid gap-2"><Label>Code</Label><Input name="roleCode" placeholder="protocol_guardian" required /></div>
              <div className="grid gap-2"><Label>Name</Label><Input name="roleName" placeholder="Protocol Guardian" required /></div>
              <div className="grid gap-2"><Label>Category</Label><select name="categoryId" className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">None</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryCode}</option>)}</select></div>
              <Input name="roleGroup" placeholder="protocol" />
              <Input name="metricUsageDefault" placeholder="protocol_graph" />
              <Input name="boundaryClass" placeholder="control_boundary" />
              <Input name="defaultQualityTier" type="number" min="0" max="5" defaultValue="1" />
              <Input name="defaultFlags" type="number" min="0" defaultValue="0" />
              <div className="grid gap-2 md:col-span-3"><Label>Description</Label><Textarea name="description" rows={2} /></div>
              <Button type="submit" className="md:col-span-4">Create role</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Code</TableHead><TableHead>Group</TableHead><TableHead>Metric usage</TableHead><TableHead>Flags</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {roles.map((role) => <TableRow key={role.roleId}><TableCell className="font-mono">{role.roleId}</TableCell><TableCell className="font-mono">{role.roleCode}</TableCell><TableCell>{role.roleGroup}</TableCell><TableCell>{role.metricUsageDefault}</TableCell><TableCell className="min-w-56"><FlagBadges flags={role.defaultFlags} compact /></TableCell><TableCell>{String(role.isActive)}</TableCell><TableCell className="text-right"><form action={deactivateRoleAction}><input type="hidden" name="id" value={role.roleId} /><Button size="sm" variant="outline" type="submit" disabled={!role.isActive}>Deactivate</Button></form></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
