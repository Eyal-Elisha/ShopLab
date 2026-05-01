import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { api, extractApiError, type AuthUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
interface Props {
  user: AuthUser | null;
  loading: boolean;
  onUpdated: (user: AuthUser) => void;
}
export default function ProfileDetailsForm({ user, loading, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) {
      setUsername(user?.username || "");
      setEmail(user?.email || "");
    }
  }, [editing, user]);
  const cancelEdit = () => {
    setEditing(false); setError(null); setSuccess(null);
  };
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!username.trim() || !email.trim()) return setError("Username and email are required.");
    setSaving(true);
    try {
      const response = await api.updateCurrentUser({ username: username.trim(), email: email.trim() });
      onUpdated(response.user);
      setSuccess(response.message || "Profile updated.");
      setEditing(false);
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
            <User className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle className="font-display">Account details</CardTitle>
        </div>
        {!editing && <Button type="button" variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
      </CardHeader>
      <form onSubmit={saveProfile}>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading profile...</p>}
          {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          {success && <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">{success}</div>}
          {editing ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="profile-username">Username</Label>
                <Input id="profile-username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={saving} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving} />
              </div>
            </>
          ) : (
            <div className="grid gap-3 text-sm">
              <p><span className="text-muted-foreground">Username:</span> {user?.username || "..."}</p>
              <p><span className="text-muted-foreground">Email:</span> {user?.email || "..."}</p>
            </div>
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
