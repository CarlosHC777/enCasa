"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "@/components/Clock";
import { BoardTaskCard } from "@/components/BoardTaskCard";
import { useActiveProfile } from "@/context/ProfileContext";
import { completeTask } from "@/lib/data";
import { computeCoveredDueAt } from "@/lib/schedule";
import { logoutPin } from "@/lib/pinClient";
import { useHouseData } from "@/hooks/useHouseData";
import { useNow } from "@/hooks/useNow";
import { computeTaskStatus } from "@/lib/urgency";
import type { TaskStatus } from "@/types/domain";

/** Orden cronológico: vencidas primero, luego por próximo vencimiento, sin vencimiento al final. */
function chronologicalRank(status: TaskStatus, now: Date): [number, number] {
  if (status.state === "overdue") {
    return [0, status.overdueSince?.getTime() ?? now.getTime()];
  }
  if (status.nextDueAt) return [1, status.nextDueAt.getTime()];
  return [2, Number.POSITIVE_INFINITY];
}

export default function MiTableroPage() {
  const router = useRouter();
  const { activeProfileId, ready, clearActiveProfile } = useActiveProfile();
  const { zones, profiles, tasks, completions, loading, error, refresh } =
    useHouseData();
  const now = useNow();

  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !activeProfileId) {
      router.replace("/login");
    }
  }, [ready, activeProfileId, router]);

  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  const completionsByTask = useMemo(() => {
    const map = new Map<string, typeof completions>();
    for (const completion of completions) {
      const list = map.get(completion.task_template_id) ?? [];
      list.push(completion);
      map.set(completion.task_template_id, list);
    }
    return map;
  }, [completions]);

  const myStatuses = useMemo(() => {
    if (!activeProfileId) return [];
    const statuses = tasks
      .filter((t) => t.enabled && t.assigned_to === activeProfileId)
      .map((task) =>
        computeTaskStatus(task, completionsByTask.get(task.id) ?? [], now)
      );
    return statuses.sort((a, b) => {
      const [ga, ta] = chronologicalRank(a, now);
      const [gb, tb] = chronologicalRank(b, now);
      if (ga !== gb) return ga - gb;
      if (ta !== tb) return ta - tb;
      return a.task.title.localeCompare(b.task.title, "es");
    });
  }, [tasks, completionsByTask, now, activeProfileId]);

  const activeProfileName =
    profiles.find((p) => p.id === activeProfileId)?.name ?? activeProfileId ?? "…";

  async function handleComplete(taskTemplateId: string) {
    if (!activeProfileId) return;
    setCompletingTaskId(taskTemplateId);
    setActionError(null);
    try {
      const task = tasks.find((t) => t.id === taskTemplateId);
      const coveredDueAt = task
        ? computeCoveredDueAt(task, completionsByTask.get(taskTemplateId) ?? [], now)
        : null;
      await completeTask(taskTemplateId, activeProfileId, coveredDueAt);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "No se pudo completar la tarea"
      );
    } finally {
      setCompletingTaskId(null);
    }
  }

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
          <Link href="/score" className="link-button">
            Score
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
        <h2>Tablero de {activeProfileName}</h2>
        <Clock now={now} />

        {loading && <div className="status-banner">Cargando tus tareas…</div>}
        {error && <div className="status-banner error">{error}</div>}
        {actionError && <div className="status-banner error">{actionError}</div>}

        {!loading && !error && (
          <>
            {myStatuses.length === 0 ? (
              <p className="empty-state">No tienes tareas asignadas por ahora.</p>
            ) : (
              <div className="board-list">
                {myStatuses.map((status) => (
                  <BoardTaskCard
                    key={status.task.id}
                    status={status}
                    zoneName={
                      zonesById.get(status.task.zone_id)?.name ??
                      status.task.zone_id
                    }
                    now={now}
                    onComplete={handleComplete}
                    completing={completingTaskId === status.task.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
