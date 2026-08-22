import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSyntheticUsersManager } from "@/features/admin/synthetic-users-manager";

export default function AdminSyntheticUsersPage() {
  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Synthetic users</CardTitle>
          <CardDescription>
            Search, filter, and update synthetic accounts. Disable leaves the auth user in place.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The same roster is also available as <code>public.admin_synthetic_users</code> in the SQL editor.
        </CardContent>
      </Card>
      <AdminSyntheticUsersManager />
    </div>
  );
}
