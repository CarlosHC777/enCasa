"use client";

import { formatDueMoment, formatTimeRemaining, getUrgencyVisual } from "@/lib/urgency";
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

  const visual = getUrgencyVisual(status);
  const urgencyClass = status.urgency ? `urgency-${status.urgency}` : "urgency-none";

  // Etiqueta principal de vencimiento: "Vencida desde …" o "Próximo vencimiento: …".
  let dueLine: string | null = null;
  if (status.overdueSince) {
    dueLine = `Vencida desde: ${formatDueMoment(status.overdueSince, now)}`;
  } else if (status.nextDueAt) {
    dueLine = `Próximo vencimiento: ${formatDueMoment(status.nextDueAt, now)}`;
  } else if (task.recurrence_type === "every_n_days") {
    dueLine = formatTimeRemaining(status, now);
  }

  return (
    <div className={`task-card ${urgencyClass}`}>
      <div className="task-card-header">
        <p className="task-title">{task.title}</p>
        {visual && <span className={`dot dot-${visual.status}`} aria-hidden />}
      </div>

      {status.completed ? (
        <div className="task-meta">
          <span>Responsable: {assignedName}</span>
          <span className="task-status">Completada</span>
        </div>
      ) : (
        <div className="task-meta">
          <span>Responsable: {assignedName}</span>
          {dueLine && <span className="task-due">{dueLine}</span>}
          <span className="task-status">
            {visual ? visual.label : "No aplica hoy"}
          </span>
        </div>
      )}

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
