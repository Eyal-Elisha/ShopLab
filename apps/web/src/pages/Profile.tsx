import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, extractApiError, type AuthUser } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import ProfileDetailsForm from "@/components/profile/ProfileDetailsForm";
import PasswordForm from "@/components/profile/PasswordForm";
import PreferencesForm from "@/components/profile/PreferencesForm";

export default function Profile() {
  const { userId: routeUserId = "" } = useParams();
  const { user, setUser, isReady } = useAuth();
  const [profile, setProfile] = useState<AuthUser | null>(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOwnProfile = Boolean(user && Number(routeUserId) === user.id);

  useEffect(() => {
    if (!user || !routeUserId) return;

    setLoading(true);
    api.getUserProfileById(routeUserId)
      .then((response) => {
        setProfile(response.user);
        setError(null);
      })
      .catch((err) => setError(extractApiError(err)))
      .finally(() => setLoading(false));
  }, [routeUserId, user]);

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
        {isOwnProfile ? (
          <>
            <ProfileDetailsForm
              user={profile}
              loading={loading}
              onUpdated={handleProfileUpdated}
            />
            <PreferencesForm />
            <PasswordForm loading={loading} />
          </>
        ) : (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">Access Denied</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You are not authorized to view this profile.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
