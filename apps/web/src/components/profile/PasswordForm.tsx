import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api, extractApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export default function PasswordForm({ loading }: { loading: boolean }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };
  const cancelEdit = () => {
    reset();
    setEditing(false);
    setError(null);
    setSuccess(null);
  };
  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmPassword) return setError("New passwords do not match.");
    setSaving(true);
    try {
      const response = await api.updateCurrentUserPassword({ currentPassword, newPassword });
      reset();
      setEditing(false);
      setSuccess(response.message || "Password updated.");
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <KeyRound className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle className="font-display">Password</CardTitle>
        </div>
        {!editing && <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={loading}>Edit</Button>}
      </CardHeader>
      <form onSubmit={savePassword}>
        <CardContent className="space-y-4">
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {success && <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">{success}</div>}
          {!editing && <p className="text-sm text-muted-foreground">Password changes are hidden until editing.</p>}
          {editing && (
            <>
              <div className="space-y-2">
                <Label htmlFor="current-password">Current password</Label>
                <Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={saving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={saving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={saving} />
              </div>
            </>
          )}
        </CardContent>
        {editing && (
          <CardFooter className="gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            <Button type="button" variant="outline" onClick={cancelEdit} disabled={saving}>Cancel</Button>
          </CardFooter>
        )}
      </form>
    </Card>
  );
}
