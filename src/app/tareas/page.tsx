"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TaskForm } from "@/components/TaskForm";
import { useActiveProfile } from "@/context/ProfileContext";
import {
  createTaskTemplate,
  setTaskTemplateEnabled,
  updateTaskTemplate,
  type TaskTemplateInput,
} from "@/lib/data";
import { generateTaskTemplateId } from "@/lib/slug";
import { logoutPin } from "@/lib/pinClient";
import { useTaskAdminData } from "@/hooks/useTaskAdminData";
import { useNow } from "@/hooks/useNow";
import { computeTaskStatus } from "@/lib/urgency";
import type { TaskStatus, TaskTemplate } from "@/types/domain";

type Mode = { type: "list" } | { type: "create" } | { type: "edit"; task: TaskTemplate };

type SortKey =
  | "crono"
  | "az"
  | "za"
  | "zona"
  | "responsable"
  | "activas"
  | "inactivas";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "crono", label: "Cronológico" },
  { value: "az", label: "A-Z" },
  { value: "za", label: "Z-A" },
  { value: "zona", label: "Zona" },
  { value: "responsable", label: "Responsable" },
  { value: "activas", label: "Activas primero" },
  { value: "inactivas", label: "Inactivas primero" },
];

/** Rango cronológico: vencidas primero, luego próximo vencimiento, sin vencimiento al final. */
function chronologicalRank(status: TaskStatus, now: Date): [number, number] {
  if (status.state === "overdue") {
    return [0, status.overdueSince?.getTime() ?? now.getTime()];
  }
  if (status.nextDueAt) return [1, status.nextDueAt.getTime()];
  return [2, Number.POSITIVE_INFINITY];
}

export default function TareasPage() {
  const router = useRouter();
  const { activeProfileId, ready, clearActiveProfile } = useActiveProfile();
  const { zones, profiles, tasks, completions, loading, error, refresh } =
    useTaskAdminData();
  const now = useNow();

  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("crono");

  useEffect(() => {
    if (ready && !activeProfileId) {
      router.replace("/login");
    }
  }, [ready, activeProfileId, router]);

  const profilesById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const activeProfile = activeProfileId ? profilesById.get(activeProfileId) : undefined;

  const statusByTaskId = useMemo(() => {
    const byTask = new Map<string, typeof completions>();
    for (const c of completions) {
      const list = byTask.get(c.task_template_id) ?? [];
      list.push(c);
      byTask.set(c.task_template_id, list);
    }
    const map = new Map<string, TaskStatus>();
    for (const task of tasks) {
      map.set(task.id, computeTaskStatus(task, byTask.get(task.id) ?? [], now));
    }
    return map;
  }, [tasks, completions, now]);

  const recurrenceLabelFor = (task: TaskTemplate): string => {
    const horarios =
      task.due_times && task.due_times.length > 0
        ? task.due_times.join(", ")
        : task.due_time ?? "";
    return task.recurrence_type === "daily"
      ? `Diaria${horarios ? ` · horarios ${horarios}` : ""}`
      : `Cada ${task.interval_days ?? "?"} día${task.interval_days === 1 ? "" : "s"}`;
  };

  const visibleTasks = useMemo(() => {
    const zoneName = (t: TaskTemplate) =>
      zonesById.get(t.zone_id)?.name ?? t.zone_id;
    const responsableName = (t: TaskTemplate) =>
      t.assigned_to ? profilesById.get(t.assigned_to)?.name ?? t.assigned_to : "";

    const query = search.trim().toLowerCase();
    const filtered = query
      ? tasks.filter((t) => {
          const haystack = [
            t.title,
            zoneName(t),
            responsableName(t) || "cualquiera",
            recurrenceLabelFor(t),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        })
      : [...tasks];

    const byTitle = (a: TaskTemplate, b: TaskTemplate) =>
      a.title.localeCompare(b.title, "es");

    filtered.sort((a, b) => {
      switch (sortKey) {
        case "az":
          return byTitle(a, b);
        case "za":
          return byTitle(b, a);
        case "zona":
          return zoneName(a).localeCompare(zoneName(b), "es") || byTitle(a, b);
        case "responsable":
          return (
            responsableName(a).localeCompare(responsableName(b), "es") ||
            byTitle(a, b)
          );
        case "activas":
          return a.enabled === b.enabled ? byTitle(a, b) : a.enabled ? -1 : 1;
        case "inactivas":
          return a.enabled === b.enabled ? byTitle(a, b) : a.enabled ? 1 : -1;
        case "crono":
        default: {
          const sa = statusByTaskId.get(a.id);
          const sb = statusByTaskId.get(b.id);
          if (!sa || !sb) return byTitle(a, b);
          const [ga, ta] = chronologicalRank(sa, now);
          const [gb, tb] = chronologicalRank(sb, now);
          if (ga !== gb) return ga - gb;
          if (ta !== tb) return ta - tb;
          return byTitle(a, b);
        }
      }
    });
    return filtered;
  }, [tasks, search, sortKey, zonesById, profilesById, statusByTaskId, now]);

  const hasFilters = search.trim() !== "" || sortKey !== "crono";

  function handleSwitchProfile() {
    clearActiveProfile();
    router.replace("/login");
  }

  async function handleLogoutPin() {
    await logoutPin();
    router.replace("/pin");
  }

  async function handleSave(input: TaskTemplateInput) {
    setSaving(true);
    setFormError(null);
    try {
      if (mode.type === "edit") {
        await updateTaskTemplate(mode.task.id, input);
      } else {
        const id = generateTaskTemplateId(
          input.zone_id,
          input.title,
          tasks.map((t) => t.id)
        );
        await createTaskTemplate(id, input);
      }
      refresh();
      setMode({ type: "list" });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo guardar la tarea"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(task: TaskTemplate) {
    setTogglingId(task.id);
    setActionError(null);
    try {
      await setTaskTemplateEnabled(task.id, !task.enabled);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "No se pudo actualizar la tarea"
      );
    } finally {
      setTogglingId(null);
    }
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
          <Link href="/mi-tablero" className="link-button">
            Mi tablero
          </Link>
          <Link href="/score" className="link-button">
            Score
          </Link>
          <Link href="/historial" className="link-button">
            Historial
          </Link>
          <span>{activeProfile?.name ?? "…"}</span>
          <button type="button" className="link-button" onClick={handleSwitchProfile}>
            Cambiar
          </button>
          <button type="button" className="link-button" onClick={handleLogoutPin}>
            Salir
          </button>
        </div>
      </header>

      <main className="container">
        {loading && <div className="status-banner">Cargando tareas…</div>}
        {error && <div className="status-banner error">{error}</div>}
        {actionError && <div className="status-banner error">{actionError}</div>}

        {!loading && !error && mode.type !== "list" && (
          <TaskForm
            zones={zones}
            profiles={profiles}
            initialTask={mode.type === "edit" ? mode.task : null}
            saving={saving}
            error={formError}
            onSave={handleSave}
            onCancel={() => {
              setFormError(null);
              setMode({ type: "list" });
            }}
          />
        )}

        {!loading && !error && mode.type === "list" && (
          <>
            <div className="admin-toolbar">
              <h2>Tareas</h2>
              <button
                type="button"
                className="button-primary"
                onClick={() => setMode({ type: "create" })}
              >
                + Nueva tarea
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="empty-state">No hay tareas todavía.</p>
            ) : (
              <>
                <div className="admin-filters">
                  <div className="form-field">
                    <label htmlFor="task-search">Buscar</label>
                    <input
                      id="task-search"
                      type="search"
                      placeholder="Título, zona, responsable o tipo…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="task-sort">Ordenar por</label>
                    <select
                      id="task-sort"
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setSearch("");
                      setSortKey("crono");
                    }}
                    disabled={!hasFilters}
                  >
                    Limpiar
                  </button>
                </div>

                <p className="admin-count">
                  Mostrando {visibleTasks.length} de {tasks.length} tareas
                </p>

                {visibleTasks.length === 0 ? (
                  <p className="empty-state">
                    Ninguna tarea coincide con la búsqueda.
                  </p>
                ) : (
                  <div className="admin-list">
                    {visibleTasks.map((task) => {
                      const zoneName =
                        zonesById.get(task.zone_id)?.name ?? task.zone_id;
                      const assignedName = task.assigned_to
                        ? profilesById.get(task.assigned_to)?.name ??
                          task.assigned_to
                        : "Cualquiera";
                      const recurrenceLabel = recurrenceLabelFor(task);

                      return (
                    <div
                      key={task.id}
                      className={`admin-task${task.enabled ? "" : " disabled"}`}
                    >
                      <p className="admin-task-title">{task.title}</p>
                      <div className="admin-task-meta">
                        <span>Zona: {zoneName}</span>
                        <span>Responsable: {assignedName}</span>
                        <span>{recurrenceLabel}</span>
                        <span>{task.enabled ? "Activa" : "Desactivada"}</span>
                      </div>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => setMode({ type: "edit", task })}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={togglingId === task.id}
                          onClick={() => handleToggleEnabled(task)}
                        >
                          {togglingId === task.id
                            ? "Guardando…"
                            : task.enabled
                              ? "Desactivar"
                              : "Reactivar"}
                        </button>
                      </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
