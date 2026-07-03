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
  due_time: string | null; // "HH:MM"
  active_from: string | null; // "HH:MM"
  interval_days: number | null;
  active_days: number[] | null; // 0 (Sunday) - 6 (Saturday)
  enabled: boolean;
}

export interface TaskCompletion {
  id: string;
  task_template_id: string;
  completed_by: ProfileId;
  completed_at: string; // ISO timestamp
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
  state: TaskState;
  dueAt: Date | null;
  activeFrom: Date | null;
  lastCompletion: TaskCompletion | null;
  daysSinceLastCompletion: number | null;
}
