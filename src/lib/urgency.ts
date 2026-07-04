import type {
  TaskCompletion,
  TaskState,
  TaskStatus,
  TaskTemplate,
  UrgencyLevel,
} from "@/types/domain";

/** Worse-to-better order is red > orange > yellow > green. */
const URGENCY_RANK: Record<UrgencyLevel, number> = {
  green: 0,
  yellow: 1,
  orange: 2,
  red: 3,
};

/**
 * Turns a linear progress ratio (0 = just started, 1 = due) into an
 * urgency level using the thresholds from the product spec.
 */
export function urgencyFromProgress(progress: number): UrgencyLevel {
  if (progress >= 1) return "red";
  if (progress >= 0.75) return "orange";
  if (progress >= 0.5) return "yellow";
  return "green";
}

export function worstUrgency(levels: UrgencyLevel[]): UrgencyLevel | null {
  if (levels.length === 0) return null;
  return levels.reduce((worst, level) =>
    URGENCY_RANK[level] > URGENCY_RANK[worst] ? level : worst
  );
}

/** Combines an "HH:MM" time string with a reference date's calendar day. */
export function timeOnDate(referenceDate: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const result = new Date(referenceDate);
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
}

export function isDayApplicable(
  task: Pick<TaskTemplate, "active_days">,
  now: Date
): boolean {
  if (!task.active_days || task.active_days.length === 0) return true;
  return task.active_days.includes(now.getDay());
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function isCompletedToday(
  completions: TaskCompletion[],
  now: Date
): boolean {
  const todayStart = startOfDay(now).getTime();
  return completions.some(
    (c) => new Date(c.completed_at).getTime() >= todayStart
  );
}

export function getLatestCompletion(
  completions: TaskCompletion[]
): TaskCompletion | null {
  if (completions.length === 0) return null;
  return completions.reduce((latest, c) =>
    new Date(c.completed_at) > new Date(latest.completed_at) ? c : latest
  );
}

export function daysSince(date: Date, now: Date): number {
  const ms = startOfDay(now).getTime() - startOfDay(date).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Computes the live status of a single task instance for "now".
 * `completions` should already be filtered to this task's template id.
 */
export function computeTaskStatus(
  task: TaskTemplate,
  completions: TaskCompletion[],
  now: Date
): TaskStatus {
  const applicableToday = isDayApplicable(task, now);

  if (task.recurrence_type === "daily") {
    const completed = isCompletedToday(completions, now);
    const lastCompletion = getLatestCompletion(completions);
    const activeFrom = task.active_from
      ? timeOnDate(now, task.active_from)
      : startOfDay(now);
    const dueAt = task.due_time
      ? timeOnDate(now, task.due_time)
      : (() => {
          const d = startOfDay(now);
          d.setHours(23, 59, 0, 0);
          return d;
        })();

    if (completed || !applicableToday) {
      return {
        task,
        completed,
        applicableToday,
        urgency: null,
        progress: 0,
        state: completed ? "completed" : "pending",
        dueAt,
        activeFrom,
        lastCompletion,
        daysSinceLastCompletion: null,
      };
    }

    const totalWindow = dueAt.getTime() - activeFrom.getTime();
    const elapsed = now.getTime() - activeFrom.getTime();
    const rawProgress = totalWindow > 0 ? elapsed / totalWindow : 1;
    const clampedProgress = Math.min(Math.max(rawProgress, 0), 1);
    const urgency = urgencyFromProgress(clampedProgress);

    return {
      task,
      completed: false,
      applicableToday,
      urgency,
      progress: clampedProgress,
      state: rawProgress >= 1 ? "overdue" : "pending",
      dueAt,
      activeFrom,
      lastCompletion,
      daysSinceLastCompletion: null,
    };
  }

  // every_n_days
  const intervalDays = task.interval_days ?? 1;
  const lastCompletion = getLatestCompletion(completions);
  const daysSinceLastCompletion = lastCompletion
    ? daysSince(new Date(lastCompletion.completed_at), now)
    : null;

  // No completion history: assume the task is fully due so it surfaces
  // for someone to claim, rather than silently hiding as "green".
  const effectiveDaysSince = daysSinceLastCompletion ?? intervalDays;

  // A task is "done for its cycle" the same day it was completed.
  const completedForCycle =
    lastCompletion !== null && daysSince(new Date(lastCompletion.completed_at), now) === 0;

  if (completedForCycle || !applicableToday) {
    return {
      task,
      completed: completedForCycle,
      applicableToday,
      urgency: null,
      progress: 0,
      state: completedForCycle ? "completed" : "pending",
      dueAt: null,
      activeFrom: null,
      lastCompletion,
      daysSinceLastCompletion,
    };
  }

  const rawProgress = intervalDays > 0 ? effectiveDaysSince / intervalDays : 1;
  const clampedProgress = Math.min(Math.max(rawProgress, 0), 1);
  const urgency = urgencyFromProgress(clampedProgress);

  return {
    task,
    completed: false,
    applicableToday,
    urgency,
    progress: clampedProgress,
    state: rawProgress >= 1 ? "overdue" : "pending",
    dueAt: null,
    activeFrom: null,
    lastCompletion,
    daysSinceLastCompletion,
  };
}

export function computeZoneUrgency(statuses: TaskStatus[]): UrgencyLevel {
  const relevant = statuses
    .filter((s) => s.applicableToday && s.urgency !== null)
    .map((s) => s.urgency as UrgencyLevel);
  return worstUrgency(relevant) ?? "green";
}

/** Short label for zone cards and the map legend. */
const URGENCY_SHORT_LABEL: Record<UrgencyLevel, string> = {
  green: "Bien",
  yellow: "Próxima",
  orange: "Urgente",
  red: "Vencida",
};

/** Longer, more descriptive label for individual tasks (e.g. in the zone modal). */
const URGENCY_DETAIL_LABEL: Record<UrgencyLevel, string> = {
  green: "Lejos del límite",
  yellow: "Acercándose",
  orange: "Muy cerca del límite",
  red: "Vencida",
};

export function urgencyShortLabel(urgency: UrgencyLevel): string {
  return URGENCY_SHORT_LABEL[urgency];
}

export function urgencyDetailLabel(urgency: UrgencyLevel): string {
  return URGENCY_DETAIL_LABEL[urgency];
}

export interface UrgencyVisual {
  status: UrgencyLevel;
  progress: number;
  isOverdue: boolean;
  label: string;
}

/**
 * Bundles a task's urgency into a single display-ready object. Returns null
 * when the task has no active urgency (completed or not applicable today),
 * since those don't need a color/label in the UI.
 */
export function getUrgencyVisual(status: TaskStatus): UrgencyVisual | null {
  if (status.urgency === null) return null;
  return {
    status: status.urgency,
    progress: status.progress,
    isOverdue: status.state === "overdue",
    label: urgencyDetailLabel(status.urgency),
  };
}

export function formatTimeRemaining(status: TaskStatus, now: Date): string {
  if (status.completed) return "Completada";
  if (!status.applicableToday) return "No aplica hoy";

  if (status.dueAt) {
    const diffMs = status.dueAt.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin >= 0) {
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      if (h > 0) return `Vence en ${h}h ${m}m`;
      return `Vence en ${m}m`;
    }
    const overdueMin = Math.abs(diffMin);
    const h = Math.floor(overdueMin / 60);
    const m = overdueMin % 60;
    if (h > 0) return `Vencida hace ${h}h ${m}m`;
    return `Vencida hace ${m}m`;
  }

  if (status.daysSinceLastCompletion !== null && status.task.interval_days) {
    const remaining = status.task.interval_days - status.daysSinceLastCompletion;
    if (remaining > 0) return `Vence en ${remaining} día${remaining === 1 ? "" : "s"}`;
    if (remaining === 0) return "Vence hoy";
    return `Vencida hace ${Math.abs(remaining)} día${Math.abs(remaining) === 1 ? "" : "s"}`;
  }

  return "Sin historial: pendiente";
}

export function stateLabel(state: TaskState): string {
  switch (state) {
    case "completed":
      return "Completada";
    case "overdue":
      return "Vencida";
    case "pending":
      return "Pendiente";
  }
}
