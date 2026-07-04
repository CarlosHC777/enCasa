"use client";

import { useState, type FormEvent } from "react";
import type {
  Profile,
  RecurrenceType,
  TaskTemplate,
  Zone,
} from "@/types/domain";
import type { TaskTemplateInput } from "@/lib/data";

const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

interface TaskFormProps {
  zones: Zone[];
  profiles: Profile[];
  initialTask: TaskTemplate | null;
  saving: boolean;
  error: string | null;
  onSave: (input: TaskTemplateInput) => void;
  onCancel: () => void;
}

export function TaskForm({
  zones,
  profiles,
  initialTask,
  saving,
  error,
  onSave,
  onCancel,
}: TaskFormProps) {
  const [title, setTitle] = useState(initialTask?.title ?? "");
  const [zoneId, setZoneId] = useState(initialTask?.zone_id ?? zones[0]?.id ?? "");
  const [assignedTo, setAssignedTo] = useState(initialTask?.assigned_to ?? "");
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    initialTask?.recurrence_type ?? "daily"
  );
  const [dueTimes, setDueTimes] = useState<string[]>(() => {
    const source =
      initialTask?.due_times && initialTask.due_times.length > 0
        ? initialTask.due_times
        : initialTask?.due_time
          ? [initialTask.due_time]
          : [];
    return Array.from(new Set(source)).sort();
  });
  const [timeDraft, setTimeDraft] = useState("");
  const [intervalDays, setIntervalDays] = useState(
    initialTask?.interval_days != null ? String(initialTask.interval_days) : ""
  );
  const [activeDays, setActiveDays] = useState<boolean[]>(() => {
    const selected = new Array(7).fill(false);
    for (const day of initialTask?.active_days ?? []) {
      selected[day] = true;
    }
    return selected;
  });

  const [localError, setLocalError] = useState<string | null>(null);

  function toggleDay(index: number) {
    setActiveDays((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  function addDueTime() {
    if (!timeDraft) return;
    setDueTimes((prev) =>
      prev.includes(timeDraft) ? prev : [...prev, timeDraft].sort()
    );
    setTimeDraft("");
    setLocalError(null);
  }

  function removeDueTime(time: string) {
    setDueTimes((prev) => prev.filter((t) => t !== time));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const selectedDays = activeDays
      .map((checked, index) => (checked ? index : null))
      .filter((v): v is number => v !== null);

    const sortedDueTimes = Array.from(new Set(dueTimes)).sort();

    if (recurrenceType === "daily" && sortedDueTimes.length === 0) {
      setLocalError("Agrega al menos un horario de vencimiento.");
      return;
    }
    setLocalError(null);

    onSave({
      title: title.trim(),
      zone_id: zoneId,
      assigned_to: assignedTo || null,
      recurrence_type: recurrenceType,
      // due_times es la fuente de verdad; due_time (primer horario) se guarda
      // por compatibilidad legacy.
      due_times: recurrenceType === "daily" ? sortedDueTimes : null,
      due_time:
        recurrenceType === "daily" ? sortedDueTimes[0] ?? null : null,
      active_from: null,
      interval_days:
        recurrenceType === "every_n_days"
          ? intervalDays
            ? Number(intervalDays)
            : null
          : null,
      active_days: selectedDays.length > 0 ? selectedDays : null,
    });
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <h2>{initialTask ? "Editar tarea" : "Nueva tarea"}</h2>

      {error && <div className="status-banner error">{error}</div>}
      {localError && <div className="status-banner error">{localError}</div>}

      <div className="form-field">
        <label htmlFor="task-title">Título</label>
        <input
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="task-zone">Zona</label>
          <select
            id="task-zone"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
            required
          >
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="task-assigned">Responsable</label>
          <select
            id="task-assigned"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            <option value="">Cualquiera</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="task-recurrence">Tipo de recurrencia</label>
        <select
          id="task-recurrence"
          value={recurrenceType}
          onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
        >
          <option value="daily">Diaria</option>
          <option value="every_n_days">Cada N días</option>
        </select>
      </div>

      {recurrenceType === "daily" ? (
        <div className="form-field">
          <label htmlFor="task-due-time">Horarios de vencimiento</label>
          <div className="due-times-input">
            <input
              id="task-due-time"
              type="time"
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDueTime();
                }
              }}
            />
            <button
              type="button"
              className="button-secondary"
              onClick={addDueTime}
              disabled={!timeDraft}
            >
              Agregar horario
            </button>
          </div>
          {dueTimes.length === 0 ? (
            <p className="due-times-empty">
              Sin horarios. La tarea vencerá en cada horario que agregues.
            </p>
          ) : (
            <div className="due-times-chips">
              {dueTimes.map((time) => (
                <span key={time} className="due-time-chip">
                  {time}
                  <button
                    type="button"
                    aria-label={`Quitar ${time}`}
                    onClick={() => removeDueTime(time)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="form-field">
          <label htmlFor="task-interval">Cada cuántos días</label>
          <input
            id="task-interval"
            type="number"
            min={1}
            value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value)}
            required
          />
        </div>
      )}

      <div className="form-field">
        <label>Días activos (opcional; ninguno = todos los días)</label>
        <div className="checkbox-grid">
          {DAY_LABELS.map((label, index) => (
            <label key={label}>
              <input
                type="checkbox"
                checked={activeDays[index]}
                onChange={() => toggleDay(index)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="submit" className="button-primary" disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
