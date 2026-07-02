import { createEntityAction, deactivateEntityAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function EntitiesPage() {
  try {
    const { entities, categories } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create entity</CardTitle></CardHeader>
          <CardContent>
            <form action={createEntityAction} className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2"><Label>Code</Label><Input name="entityCode" placeholder="binance" required /></div>
              <div className="grid gap-2"><Label>Name</Label><Input name="entityName" placeholder="Binance" required /></div>
              <div className="grid gap-2"><Label>Type</Label><Input name="entityType" placeholder="cex" /></div>
              <div className="grid gap-2"><Label>Category</Label><select name="categoryId" className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">None</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryCode}</option>)}</select></div>
              <div className="grid gap-2 md:col-span-2"><Label>Website</Label><Input name="websiteUrl" placeholder="https://..." /></div>
              <div className="grid gap-2 md:col-span-3"><Label>Description</Label><Textarea name="description" rows={2} /></div>
              <Button type="submit" className="md:col-span-3">Create entity</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Entities</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {entities.map((entity) => <TableRow key={entity.id}><TableCell className="font-mono">{entity.entityCode}</TableCell><TableCell>{entity.entityName}</TableCell><TableCell>{entity.entityType}</TableCell><TableCell>{String(entity.isActive)}</TableCell><TableCell className="text-right"><form action={deactivateEntityAction}><input type="hidden" name="id" value={entity.id} /><Button size="sm" variant="outline" type="submit" disabled={!entity.isActive}>Deactivate</Button></form></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
