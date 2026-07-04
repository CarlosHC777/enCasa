export type ProfileId = string;

export interface Profile {
  id: ProfileId;
  name: string;
}

export interface Zone {
  id: string;
  name: string;
  sort_order: number;
}

export type RecurrenceType = "daily" | "every_n_days";

export interface TaskTemplate {
  id: string;
  zone_id: string;
  title: string;
  assigned_to: ProfileId | null;
  recurrence_type: RecurrenceType;
  /** Múltiples horarios de vencimiento diario, "HH:MM". Fuente de verdad para tareas daily. */
  due_times: string[] | null;
  due_time: string | null; // "HH:MM" (legacy; primer horario por compatibilidad)
  active_from: string | null; // "HH:MM" (legacy/deprecated)
  interval_days: number | null;
  active_days: number[] | null; // 0 (Sunday) - 6 (Saturday)
  enabled: boolean;
  /** Fecha de creación; los vencimientos anteriores a esta fecha no se consideran. */
  created_at: string | null; // ISO timestamp
}

export interface TaskCompletion {
  id: string;
  task_template_id: string;
  completed_by: ProfileId;
  completed_at: string; // ISO timestamp
}

/** A task_completion with its task/zone/profile names already resolved, for /historial. */
export interface TaskCompletionHistoryEntry {
  id: string;
  completedAt: string; // ISO timestamp
  completedById: ProfileId;
  completedByName: string;
  taskTemplateId: string;
  taskTitle: string;
  zoneId: string;
  zoneName: string;
  assignedToName: string | null;
}

export type UrgencyLevel = "green" | "yellow" | "orange" | "red";

export type TaskState = "pending" | "completed" | "overdue";

export interface TaskStatus {
  task: TaskTemplate;
  /** Whether the task counts as done for its current cycle (today, or within interval). */
  completed: boolean;
  /** Whether the task is relevant today (e.g. respects active_days). */
  applicableToday: boolean;
  /** null when completed or not applicable — such tasks don't affect zone color. */
  urgency: UrgencyLevel | null;
  /** Linear progress toward due (0 = just started, 1 = due/overdue). 0 when completed or not applicable. */
  progress: number;
  state: TaskState;
  dueAt: Date | null;
  /** Próximo vencimiento pendiente cuando la tarea aún no está vencida. */
  nextDueAt: Date | null;
  /** Momento del vencimiento incumplido cuando la tarea está vencida. */
  overdueSince: Date | null;
  activeFrom: Date | null;
  lastCompletion: TaskCompletion | null;
  daysSinceLastCompletion: number | null;
}
