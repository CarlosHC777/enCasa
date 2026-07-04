"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "@/components/Clock";
import { DailyScoreBoard } from "@/components/DailyScoreBoard";
import { useActiveProfile } from "@/context/ProfileContext";
import { logoutPin } from "@/lib/pinClient";
import { useHouseData } from "@/hooks/useHouseData";
import { useDailyScore } from "@/hooks/useDailyScore";
import { useNow } from "@/hooks/useNow";

export default function ScorePage() {
  const router = useRouter();
  const { activeProfileId, ready, clearActiveProfile } = useActiveProfile();
  const { profiles, tasks, completions, loading, error } = useHouseData();
  const now = useNow();

  useEffect(() => {
    if (ready && !activeProfileId) {
      router.replace("/login");
    }
  }, [ready, activeProfileId, router]);

  const dailyScore = useDailyScore(tasks, profiles, completions, now);

  const activeProfileName =
    profiles.find((p) => p.id === activeProfileId)?.name ?? activeProfileId ?? "…";

  async function handleLogoutPin() {
    await logoutPin();
    router.replace("/pin");
  }

  if (!ready || !activeProfileId) {
    return null;
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>enCasa</h1>
        <div className="profile-badge">
          <Link href="/" className="link-button">
            Volver al mapa
          </Link>
          <Link href="/tareas" className="link-button">
            Administrar tareas
          </Link>
          <Link href="/historial" className="link-button">
            Historial
          </Link>
          <span>{activeProfileName}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              clearActiveProfile();
              router.replace("/login");
            }}
          >
            Cambiar
          </button>
          <button type="button" className="link-button" onClick={handleLogoutPin}>
            Salir
          </button>
        </div>
      </header>

      <main className="container">
        <h2>Score del día</h2>
        <Clock now={now} />

        {loading && <div className="status-banner">Cargando score…</div>}
        {error && <div className="status-banner error">{error}</div>}

        {!loading && !error && <DailyScoreBoard score={dailyScore} />}
      </main>
    </div>
  );
}
