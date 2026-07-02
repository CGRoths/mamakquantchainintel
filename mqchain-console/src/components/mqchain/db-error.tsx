import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DbError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unable to load database-backed data.";

  return (
    <Alert variant="destructive">
      <AlertTitle>Database unavailable</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
