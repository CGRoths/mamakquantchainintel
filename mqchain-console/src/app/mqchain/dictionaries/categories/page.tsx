import { createCategoryAction, deactivateCategoryAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function CategoriesPage() {
  try {
    const { categories } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create category</CardTitle></CardHeader>
          <CardContent>
            <form action={createCategoryAction} className="grid gap-3 md:grid-cols-4">
              <div className="grid gap-2"><Label>ID</Label><Input name="categoryId" type="number" required /></div>
              <div className="grid gap-2"><Label>Code</Label><Input name="categoryCode" placeholder="rwa" required /></div>
              <div className="grid gap-2"><Label>Name</Label><Input name="categoryName" placeholder="Real World Asset" required /></div>
              <div className="grid gap-2"><Label>Parent</Label><Input name="parentCategoryId" type="number" /></div>
              <Input name="domainCode" placeholder="defi" />
              <Input name="metricDomain" placeholder="protocol_graph" />
              <div className="grid gap-2 md:col-span-2"><Label>Description</Label><Textarea name="description" rows={2} /></div>
              <Button type="submit" className="md:col-span-4">Create category</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Domain</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {categories.map((category) => <TableRow key={category.categoryId}><TableCell className="font-mono">{category.categoryId}</TableCell><TableCell className="font-mono">{category.categoryCode}</TableCell><TableCell>{category.categoryName}</TableCell><TableCell>{category.domainCode}</TableCell><TableCell>{String(category.isActive)}</TableCell><TableCell className="text-right"><form action={deactivateCategoryAction}><input type="hidden" name="id" value={category.categoryId} /><Button size="sm" variant="outline" type="submit" disabled={!category.isActive}>Deactivate</Button></form></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
