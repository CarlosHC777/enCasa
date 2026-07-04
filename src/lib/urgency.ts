import type {
  TaskCompletion,
  TaskState,
  TaskStatus,
  TaskTemplate,
  UrgencyLevel,
} from "@/types/domain";
import {
  buildDailyOccurrences,
  daysSince,
  isDayApplicable,
  normalizeDueTimes,
  startOfDay,
  timeOnDate,
} from "@/lib/schedule";

// Re-export de primitivas de agenda para no romper importadores previos.
export {
  daysSince,
  isDayApplicable,
  normalizeDueTimes,
  timeOnDate,
} from "@/lib/schedule";

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

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Estado de una tarea daily con horarios múltiples y ventana de gracia. La
 * ocurrencia pendiente es la más antigua sin cubrir cuya gracia sigue abierta;
 * las ocurrencias cuya gracia expiró sin cubrirse se saltan ("perdidas"), por
 * lo que la tarea avanza sola al siguiente vencimiento.
 */
function computeDailyStatus(
  task: TaskTemplate,
  completions: TaskCompletion[],
  now: Date
): TaskStatus {
  const lastCompletion = getLatestCompletion(completions);

  const green = (activeFrom: Date | null): TaskStatus => ({
    task,
    completed: false,
    applicableToday: true,
    urgency: "green",
    progress: 0,
    state: "pending",
    dueAt: null,
    nextDueAt: null,
    overdueSince: null,
    activeFrom,
    lastCompletion,
    daysSinceLastCompletion: null,
  });

  if (normalizeDueTimes(task).length === 0) return green(null);

  const { occurrences, pending, anchor } = buildDailyOccurrences(
    task,
    completions,
    now
  );

  // Todo cubierto en el horizonte (o sin ocurrencias): sin urgencia hoy.
  if (!pending) return green(anchor);

  const currentDue = pending.dueAt;
  const idx = occurrences.indexOf(pending);
  const previousDue = idx > 0 ? occurrences[idx - 1].dueAt : anchor;

  const total = currentDue.getTime() - previousDue.getTime();
  const elapsed = now.getTime() - previousDue.getTime();
  const progress = clamp01(total > 0 ? elapsed / total : 1);
  const isOverdue = now.getTime() >= currentDue.getTime();

  return {
    task,
    completed: false,
    applicableToday: true,
    urgency: urgencyFromProgress(progress),
    progress,
    state: isOverdue ? "overdue" : "pending",
    dueAt: currentDue,
    nextDueAt: isOverdue ? null : currentDue,
    overdueSince: isOverdue ? currentDue : null,
    activeFrom: previousDue,
    lastCompletion,
    daysSinceLastCompletion: null,
  };
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
  if (task.recurrence_type === "daily") {
    return computeDailyStatus(task, completions, now);
  }

  // every_n_days
  const applicableToday = isDayApplicable(task, now);
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
    lastCompletion !== null &&
    daysSince(new Date(lastCompletion.completed_at), now) === 0;

  if (completedForCycle || !applicableToday) {
    return {
      task,
      completed: completedForCycle,
      applicableToday,
      urgency: null,
      progress: 0,
      state: completedForCycle ? "completed" : "pending",
      dueAt: null,
      nextDueAt: null,
      overdueSince: null,
      activeFrom: null,
      lastCompletion,
      daysSinceLastCompletion,
    };
  }

  const rawProgress = intervalDays > 0 ? effectiveDaysSince / intervalDays : 1;
  const clampedProgress = clamp01(rawProgress);
  const urgency = urgencyFromProgress(clampedProgress);

  return {
    task,
    completed: false,
    applicableToday,
    urgency,
    progress: clampedProgress,
    state: rawProgress >= 1 ? "overdue" : "pending",
    dueAt: null,
    nextDueAt: null,
    overdueSince: null,
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
  shortLabel: string;
  nextDueAt: Date | null;
  overdueSince: Date | null;
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
    shortLabel: urgencyShortLabel(status.urgency),
    nextDueAt: status.nextDueAt,
    overdueSince: status.overdueSince,
  };
}

/** Formatea un momento como "hoy 6:00 p.m.", "mañana 9:00 a.m." o "lun 9:00 a.m.". */
export function formatDueMoment(date: Date, now: Date): string {
  const time = date.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });
  const startNow = startOfDay(now).getTime();
  const startDate = startOfDay(date).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  let prefix: string;
  if (startDate === startNow) prefix = "hoy";
  else if (startDate === startNow + oneDay) prefix = "mañana";
  else if (startDate === startNow - oneDay) prefix = "ayer";
  else prefix = date.toLocaleDateString("es-MX", { weekday: "short" });
  return `${prefix} ${time}`;
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
