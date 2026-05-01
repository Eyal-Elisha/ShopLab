import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, extractApiError, type AuthUser } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import ProfileDetailsForm from "@/components/profile/ProfileDetailsForm";
import PasswordForm from "@/components/profile/PasswordForm";

export default function Profile() {
  const { user, setUser, isReady } = useAuth();
  const userId = user?.id;
  const [profile, setProfile] = useState<AuthUser | null>(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    api.getCurrentUser()
      .then((response) => {
        setUser(response.user);
        setProfile(response.user);
        setError(null);
      })
      .catch((err) => setError(extractApiError(err)))
      .finally(() => setLoading(false));
  }, [setUser, userId]);

  const handleProfileUpdated = (updatedUser: AuthUser) => {
    setUser(updatedUser);
    setProfile(updatedUser);
  };

  if (!isReady) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground">Checking session...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage the account details you use across ShopLab.</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid max-w-2xl gap-6">
        <ProfileDetailsForm
          user={profile}
          loading={loading}
          onUpdated={handleProfileUpdated}
        />
        <PasswordForm loading={loading} />
      </div>
    </div>
  );
}
