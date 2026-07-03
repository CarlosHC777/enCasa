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
import type { TaskTemplate } from "@/types/domain";

type Mode = { type: "list" } | { type: "create" } | { type: "edit"; task: TaskTemplate };

export default function TareasPage() {
  const router = useRouter();
  const { activeProfileId, ready, clearActiveProfile } = useActiveProfile();
  const { zones, profiles, tasks, loading, error, refresh } = useTaskAdminData();

  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
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
  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const activeProfile = activeProfileId ? profilesById.get(activeProfileId) : undefined;

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
              <div className="admin-list">
                {tasks.map((task) => {
                  const zoneName = zonesById.get(task.zone_id)?.name ?? task.zone_id;
                  const assignedName = task.assigned_to
                    ? profilesById.get(task.assigned_to)?.name ?? task.assigned_to
                    : "Cualquiera";
                  const recurrenceLabel =
                    task.recurrence_type === "daily"
                      ? `Diaria${task.due_time ? ` · hasta las ${task.due_time}` : ""}`
                      : `Cada ${task.interval_days ?? "?"} día${task.interval_days === 1 ? "" : "s"}`;

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
      </main>
    </div>
  );
}
