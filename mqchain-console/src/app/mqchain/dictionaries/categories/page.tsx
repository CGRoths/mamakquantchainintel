import { DbError } from "@/components/mqchain/db-error";
import { CreateCategoryForm, DeactivateCategoryForm } from "@/components/mqchain/dictionary-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDictionaries } from "@/lib/mqchain/services/dictionary-service";

export default async function CategoriesPage() {
  try {
    const { categories } = await listDictionaries();
    return (
      <>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Create category</CardTitle></CardHeader>
          <CardContent>
            <CreateCategoryForm />
          </CardContent>
        </Card>
        <Card className="rounded-lg">
          <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Domain</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {categories.map((category) => <TableRow key={category.categoryId}><TableCell className="font-mono">{category.categoryId}</TableCell><TableCell className="font-mono">{category.categoryCode}</TableCell><TableCell>{category.categoryName}</TableCell><TableCell>{category.domainCode}</TableCell><TableCell>{String(category.isActive)}</TableCell><TableCell className="text-right"><DeactivateCategoryForm id={category.categoryId} disabled={!category.isActive} /></TableCell></TableRow>)}
            </TableBody></Table>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
