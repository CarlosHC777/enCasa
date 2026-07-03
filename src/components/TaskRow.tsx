"use client";

import { formatTimeRemaining, stateLabel } from "@/lib/urgency";
import type { Profile, TaskStatus } from "@/types/domain";

interface TaskRowProps {
  status: TaskStatus;
  profilesById: Map<string, Profile>;
  now: Date;
  onComplete: (taskTemplateId: string) => void;
  completing: boolean;
}

export function TaskRow({
  status,
  profilesById,
  now,
  onComplete,
  completing,
}: TaskRowProps) {
  const { task } = status;
  const assignedName = task.assigned_to
    ? profilesById.get(task.assigned_to)?.name ?? task.assigned_to
    : "Cualquiera";

  const dueLabel = task.due_time
    ? `hasta las ${task.due_time}`
    : task.recurrence_type === "every_n_days"
      ? `cada ${task.interval_days} día${task.interval_days === 1 ? "" : "s"}`
      : "";

  const urgencyClass = status.urgency ? `urgency-${status.urgency}` : "urgency-none";

  return (
    <div className={`task-card ${urgencyClass}`}>
      <p className="task-title">{task.title}</p>
      <div className="task-meta">
        <span>Asignado: {assignedName}</span>
        {dueLabel && <span>{dueLabel}</span>}
        <span className="task-status">{stateLabel(status.state)}</span>
        <span>{formatTimeRemaining(status, now)}</span>
      </div>
      <button
        type="button"
        className="complete-button"
        disabled={status.completed || completing || !status.applicableToday}
        onClick={() => onComplete(task.id)}
      >
        {status.completed ? "Completada" : completing ? "Guardando…" : "Completar"}
      </button>
    </div>
  );
}
