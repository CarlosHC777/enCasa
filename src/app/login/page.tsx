"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchProfiles } from "@/lib/data";
import { useActiveProfile } from "@/context/ProfileContext";
import type { Profile } from "@/types/domain";

export default function LoginPage() {
  const router = useRouter();
  const { setActiveProfileId } = useActiveProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfiles()
      .then(setProfiles)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Error cargando perfiles")
      )
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(profile: Profile) {
    setActiveProfileId(profile.id);
    router.replace("/");
  }

  return (
    <main className="login-page">
      <div className="login-title">
        <h1>enCasa</h1>
        <p>¿Quién eres?</p>
      </div>

      {loading && <div className="status-banner">Cargando perfiles…</div>}
      {error && <div className="status-banner error">{error}</div>}

      {!loading && !error && (
        <div className="profile-list">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="profile-button"
              onClick={() => handleSelect(profile)}
            >
              {profile.name}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
