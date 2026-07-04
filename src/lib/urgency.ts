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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normaliza los horarios de vencimiento de una tarea daily. Prioriza
 * `due_times`; si está vacío usa `due_time` legacy como único horario.
 * Devuelve horarios "HH:MM" únicos y ordenados ascendentemente.
 */
export function normalizeDueTimes(
  task: Pick<TaskTemplate, "due_times" | "due_time">
): string[] {
  const source =
    task.due_times && task.due_times.length > 0
      ? task.due_times
      : task.due_time
        ? [task.due_time]
        : [];
  const unique = Array.from(new Set(source.filter(Boolean)));
  // Los "HH:MM" con ceros a la izquierda ordenan correctamente de forma léxica.
  return unique.sort();
}

/**
 * Genera los primeros `count` vencimientos programados estrictamente
 * posteriores a `anchor`, respetando `active_days` (null/[] = todos los días).
 */
function generateDailyDues(
  anchor: Date,
  dueTimes: string[],
  activeDays: number[] | null,
  count: number
): Date[] {
  if (dueTimes.length === 0 || count <= 0) return [];
  const result: Date[] = [];
  const day = startOfDay(anchor);
  const anchorMs = anchor.getTime();
  const allDays = !activeDays || activeDays.length === 0;
  let guard = 0;
  const maxGuard = count * dueTimes.length + 800; // tope de seguridad
  while (result.length < count && guard < maxGuard) {
    guard++;
    if (allDays || activeDays!.includes(day.getDay())) {
      for (const t of dueTimes) {
        const due = timeOnDate(day, t);
        if (due.getTime() > anchorMs) {
          result.push(due);
          if (result.length >= count) break;
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return result;
}

/**
 * Estado de una tarea daily con horarios múltiples usando el modelo de
 * "slots": cada completion posterior al anchor consume un vencimiento y
 * avanza al siguiente. El tiempo por sí solo nunca avanza el slot, por lo
 * que una tarea vencida permanece vencida hasta que alguien la completa.
 */
function computeDailyStatus(
  task: TaskTemplate,
  completions: TaskCompletion[],
  now: Date
): TaskStatus {
  const dueTimes = normalizeDueTimes(task);
  const lastCompletion = getLatestCompletion(completions);

  // Sin horarios configurados: no hay urgencia, tratar como verde sin crashear.
  if (dueTimes.length === 0) {
    return {
      task,
      completed: false,
      applicableToday: true,
      urgency: "green",
      progress: 0,
      state: "pending",
      dueAt: null,
      nextDueAt: null,
      overdueSince: null,
      activeFrom: null,
      lastCompletion,
      daysSinceLastCompletion: null,
    };
  }

  // Anchor = creación de la tarea, acotado a la ventana de historial (30 días)
  // para mantenerlo consistente con las completions disponibles.
  const createdAt = task.created_at ? new Date(task.created_at) : null;
  const windowStart = new Date(now.getTime() - 31 * ONE_DAY_MS);
  const anchor =
    createdAt && createdAt.getTime() > windowStart.getTime()
      ? createdAt
      : windowStart;

  const sortedAsc = [...completions].sort(
    (a, b) =>
      new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
  );
  const consumed = sortedAsc.filter(
    (c) => new Date(c.completed_at).getTime() > anchor.getTime()
  ).length;

  const dues = generateDailyDues(
    anchor,
    dueTimes,
    task.active_days ?? null,
    consumed + 1
  );
  const currentDue = dues[consumed] ?? null;
  const previousDue = consumed > 0 ? dues[consumed - 1] ?? anchor : anchor;

  // No se pudo determinar el próximo vencimiento (caso degenerado): verde.
  if (!currentDue) {
    return {
      task,
      completed: false,
      applicableToday: true,
      urgency: "green",
      progress: 0,
      state: "pending",
      dueAt: null,
      nextDueAt: null,
      overdueSince: null,
      activeFrom: previousDue,
      lastCompletion,
      daysSinceLastCompletion: null,
    };
  }

  const total = currentDue.getTime() - previousDue.getTime();
  const elapsed = now.getTime() - previousDue.getTime();
  const rawProgress = total > 0 ? elapsed / total : 1;
  const progress = Math.min(Math.max(rawProgress, 0), 1);
  const isOverdue = now.getTime() >= currentDue.getTime();
  const urgency = urgencyFromProgress(progress);

  return {
    task,
    completed: false,
    applicableToday: true,
    urgency,
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
      nextDueAt: null,
      overdueSince: null,
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
  let prefix: string;
  if (startDate === startNow) prefix = "hoy";
  else if (startDate === startNow + ONE_DAY_MS) prefix = "mañana";
  else if (startDate === startNow - ONE_DAY_MS) prefix = "ayer";
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
