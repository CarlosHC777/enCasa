"use client";

import {
  formatDueMoment,
  formatTimeRemaining,
  normalizeDueTimes,
  urgencyShortLabel,
} from "@/lib/urgency";
import type { TaskStatus } from "@/types/domain";

interface BoardTaskCardProps {
  status: TaskStatus;
  zoneName: string;
  now: Date;
  onComplete: (taskTemplateId: string) => void;
  completing: boolean;
}

export function BoardTaskCard({
  status,
  zoneName,
  now,
  onComplete,
  completing,
}: BoardTaskCardProps) {
  const { task } = status;
  const level = status.urgency ?? "green";

  // Línea de vencimiento, reutilizando la misma lógica que el modal de zona.
  let dueLine: string | null = null;
  if (status.overdueSince) {
    dueLine = `Vencida desde: ${formatDueMoment(status.overdueSince, now)}`;
  } else if (status.nextDueAt) {
    dueLine = `Próximo vencimiento: ${formatDueMoment(status.nextDueAt, now)}`;
  } else if (task.recurrence_type === "every_n_days") {
    dueLine = formatTimeRemaining(status, now);
  }

  const horarios =
    task.recurrence_type === "daily" ? normalizeDueTimes(task) : [];

  const badgeText = status.completed
    ? "Completada"
    : status.urgency
      ? urgencyShortLabel(status.urgency)
      : "Bien";

  return (
    <div className={`board-card urgency-${level}`}>
      <div className="board-card-head">
        <p className="task-title">{task.title}</p>
        <span className={`status-pill pill-${status.completed ? "none" : level}`}>
          {badgeText}
        </span>
      </div>

      <div className="board-card-meta">
        <span>Zona: {zoneName}</span>
        {dueLine && <span className="task-due">{dueLine}</span>}
        {horarios.length > 0 && <span>Horarios: {horarios.join(", ")}</span>}
      </div>

      <button
        type="button"
        className="complete-button"
        disabled={status.completed || completing || !status.applicableToday}
        onClick={() => onComplete(task.id)}
      >
        {status.completed
          ? "Completada"
          : completing
            ? "Guardando…"
            : "Completar"}
      </button>
    </div>
  );
}
