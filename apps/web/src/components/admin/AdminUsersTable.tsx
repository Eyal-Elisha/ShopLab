import { useState } from "react";
import { toast } from "sonner";
import { api, extractApiError, type AdminUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  users: AdminUser[];
  currentUserId: number;
  onChanged: () => Promise<void>;
}

export default function AdminUsersTable({ users, currentUserId, onChanged }: Props) {
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const setBusy = (id: number, busy: boolean) => setPending((prev) => ({ ...prev, [id]: busy }));

  const changeRole = async (target: AdminUser, role: "user" | "admin") => {
    if (target.role === role) return;
    setBusy(target.id, true);
    try {
      await api.updateUserRole(target.id, role);
      toast.success(`${target.username} is now ${role}.`);
      await onChanged();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(target.id, false);
    }
  };

  const deleteUser = async (target: AdminUser) => {
    if (!window.confirm(`Delete user ${target.username}?`)) return;
    setBusy(target.id, true);
    try {
      await api.deleteAdminUser(target.id);
      toast.success(`${target.username} deleted.`);
      await onChanged();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(target.id, false);
    }
  };

  return (
    <Card className="mb-8">
      <CardHeader><CardTitle className="font-display">Users</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead><TableHead>Email</TableHead>
              <TableHead>Role</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const currentRole: "user" | "admin" = u.role === "admin" ? "admin" : "user";
              const isSelf = u.id === currentUserId;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Select value={currentRole} onValueChange={(value) => changeRole(u, value as "user" | "admin")} disabled={pending[u.id] || isSelf}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="user">user</SelectItem><SelectItem value="admin">admin</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="destructive" size="sm" onClick={() => deleteUser(u)} disabled={pending[u.id] || isSelf}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
