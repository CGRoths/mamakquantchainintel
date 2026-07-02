import { createSettingsUserAction, updateSettingsUserAccessAction } from "@/app/mqchain/actions";
import { DbError } from "@/components/mqchain/db-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser, roleCan } from "@/lib/auth/permissions";
import { MQCHAIN_ROLES } from "@/lib/mqchain/constants";
import { listSettingsUsers } from "@/lib/mqchain/services/settings-service";
import { SETTINGS_PERMISSION_LABELS, buildRolePermissionMatrix } from "@/lib/mqchain/validators/settings";

export default async function SettingsPage() {
  try {
    const [currentUser, users] = await Promise.all([getCurrentUser(), listSettingsUsers()]);
    const canEdit = roleCan(currentUser?.role, "settings:edit");
    const permissionMatrix = buildRolePermissionMatrix();

    return (
      <>
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Operator access, RBAC permissions, and deployment guardrails.</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <Card className="rounded-lg">
            <CardHeader><CardTitle>User access</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead className="text-right">Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.displayName ?? user.email}</div>
                        <div className="font-mono text-xs text-muted-foreground">{user.email}</div>
                        <div className="font-mono text-xs text-muted-foreground">{user.id}</div>
                      </TableCell>
                      <TableCell><Badge variant={user.role === "owner" ? "default" : "secondary"}>{user.role}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "outline" : "destructive"}>{user.isActive ? "active" : "inactive"}</Badge>
                      </TableCell>
                      <TableCell>{user.hasPassword ? "set" : "missing"}</TableCell>
                      <TableCell className="min-w-72">
                        {canEdit ? (
                          <form action={updateSettingsUserAccessAction} className="flex items-end justify-end gap-2">
                            <input type="hidden" name="userId" value={user.id} />
                            <div className="grid gap-1 text-left">
                              <Label className="text-xs">Role</Label>
                              <select name="role" defaultValue={user.role} className="h-9 rounded-md border bg-background px-2 text-sm">
                                {MQCHAIN_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                              </select>
                            </div>
                            <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                              <input type="checkbox" name="isActive" defaultChecked={user.isActive} />
                              Active
                            </label>
                            <Button type="submit" size="sm" variant="outline">Update</Button>
                          </form>
                        ) : (
                          <span className="text-sm text-muted-foreground">Read only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader><CardTitle>Create user</CardTitle></CardHeader>
            <CardContent>
              {canEdit ? (
                <form action={createSettingsUserAction} className="grid gap-3">
                  <div className="grid gap-2"><Label>Email</Label><Input name="email" type="email" placeholder="operator@mamakquant.local" required /></div>
                  <div className="grid gap-2"><Label>Display name</Label><Input name="displayName" placeholder="Operator name" /></div>
                  <div className="grid gap-2">
                    <Label>Role</Label>
                    <select name="role" defaultValue="analyst" className="h-10 rounded-md border bg-background px-3 text-sm">
                      {MQCHAIN_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2"><Label>Password</Label><Input name="password" type="password" minLength={12} required /></div>
                  <Button type="submit">Create user</Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">Only owners can create users or update access.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-lg">
          <CardHeader><CardTitle>Role permissions</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  {SETTINGS_PERMISSION_LABELS.map((item) => <TableHead key={item.permission}>{item.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissionMatrix.map((row) => (
                  <TableRow key={row.role}>
                    <TableCell><Badge variant={row.role === currentUser?.role ? "default" : "secondary"}>{row.role}</Badge></TableCell>
                    {row.permissions.map((permission) => (
                      <TableCell key={permission.permission}>
                        <Badge variant={permission.allowed ? "outline" : "secondary"}>{permission.allowed ? "allowed" : "blocked"}</Badge>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader><CardTitle>Deployment notes</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Use PostgreSQL as canonical truth. Redis is optional cache only. RocksDB builds are external artifacts tracked through KV manifests.</p>
            <p>All settings mutations are server-side, owner-only, audit logged, and keep at least one active owner account available.</p>
          </CardContent>
        </Card>
      </>
    );
  } catch (error) {
    return <DbError error={error} />;
  }
}
