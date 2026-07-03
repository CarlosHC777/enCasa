"use client";

import { TaskRow } from "@/components/TaskRow";
import type { Profile, TaskStatus, Zone } from "@/types/domain";

interface ZoneModalProps {
  zone: Zone;
  statuses: TaskStatus[];
  profilesById: Map<string, Profile>;
  now: Date;
  onClose: () => void;
  onComplete: (taskTemplateId: string) => void;
  completingTaskId: string | null;
}

export function ZoneModal({
  zone,
  statuses,
  profilesById,
  now,
  onClose,
  onComplete,
  completingTaskId,
}: ZoneModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={zone.name}
      >
        <div className="modal-header">
          <h2>{zone.name}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        {statuses.length === 0 ? (
          <p className="empty-state">No hay tareas en esta zona.</p>
        ) : (
          <div className="task-list">
            {statuses.map((status) => (
              <TaskRow
                key={status.task.id}
                status={status}
                profilesById={profilesById}
                now={now}
                onComplete={onComplete}
                completing={completingTaskId === status.task.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
