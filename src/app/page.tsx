"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ZoneCard } from "@/components/ZoneCard";
import { ZoneModal } from "@/components/ZoneModal";
import { useActiveProfile } from "@/context/ProfileContext";
import { completeTask } from "@/lib/data";
import { computeTaskStatus, computeZoneUrgency } from "@/lib/urgency";
import { useHouseData } from "@/hooks/useHouseData";
import { useNow } from "@/hooks/useNow";
import type { TaskStatus } from "@/types/domain";

export default function HomePage() {
  const router = useRouter();
  const { activeProfileId, ready, clearActiveProfile } = useActiveProfile();
  const { zones, profiles, tasks, completions, loading, error, refresh } =
    useHouseData();
  const now = useNow();

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !activeProfileId) {
      router.replace("/login");
    }
  }, [ready, activeProfileId, router]);

  const profilesById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );

  const completionsByTask = useMemo(() => {
    const map = new Map<string, typeof completions>();
    for (const completion of completions) {
      const list = map.get(completion.task_template_id) ?? [];
      list.push(completion);
      map.set(completion.task_template_id, list);
    }
    return map;
  }, [completions]);

  const statusesByZone = useMemo(() => {
    const map = new Map<string, TaskStatus[]>();
    for (const task of tasks) {
      const taskCompletions = completionsByTask.get(task.id) ?? [];
      const status = computeTaskStatus(task, taskCompletions, now);
      const list = map.get(task.zone_id) ?? [];
      list.push(status);
      map.set(task.zone_id, list);
    }
    return map;
  }, [tasks, completionsByTask, now]);

  const activeProfile = activeProfileId ? profilesById.get(activeProfileId) : undefined;
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  async function handleComplete(taskTemplateId: string) {
    if (!activeProfileId) return;
    setCompletingTaskId(taskTemplateId);
    setActionError(null);
    try {
      await completeTask(taskTemplateId, activeProfileId);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "No se pudo completar la tarea"
      );
    } finally {
      setCompletingTaskId(null);
    }
  }

  function handleSwitchProfile() {
    clearActiveProfile();
    router.replace("/login");
  }

  if (!ready || !activeProfileId) {
    return null;
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>enCasa</h1>
        <div className="profile-badge">
          <Link href="/tareas" className="link-button">
            Administrar tareas
          </Link>
          <Link href="/historial" className="link-button">
            Historial
          </Link>
          <span>{activeProfile?.name ?? "…"}</span>
          <button type="button" className="link-button" onClick={handleSwitchProfile}>
            Cambiar
          </button>
        </div>
      </header>

      <main className="container">
        {loading && <div className="status-banner">Cargando la casa…</div>}
        {error && <div className="status-banner error">{error}</div>}
        {actionError && <div className="status-banner error">{actionError}</div>}

        {!loading && !error && (
          <div className="zone-map">
            {zones.map((zone) => {
              const statuses = statusesByZone.get(zone.id) ?? [];
              const urgency = computeZoneUrgency(statuses);
              return (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  urgency={urgency}
                  onClick={() => setSelectedZoneId(zone.id)}
                />
              );
            })}
          </div>
        )}
      </main>

      {selectedZone && (
        <ZoneModal
          zone={selectedZone}
          statuses={statusesByZone.get(selectedZone.id) ?? []}
          profilesById={profilesById}
          now={now}
          onClose={() => setSelectedZoneId(null)}
          onComplete={handleComplete}
          completingTaskId={completingTaskId}
        />
      )}
    </div>
  );
}
