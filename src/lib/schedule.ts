import type { TaskCompletion, TaskTemplate } from "@/types/domain";

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Ventana de gracia tras cada vencimiento diario para cubrir esa ocurrencia. */
export const GRACE_MS = 2 * 60 * 60 * 1000;
/** Días de gracia para tareas every_n_days (además del día de vencimiento). */
export const EVERY_N_GRACE_DAYS = 1;

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Combina un "HH:MM" con el día calendario de una fecha de referencia. */
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

export function daysSince(date: Date, now: Date): number {
  const ms = startOfDay(now).getTime() - startOfDay(date).getTime();
  return Math.floor(ms / ONE_DAY_MS);
}

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
  // Los "HH:MM" con ceros a la izquierda ordenan bien de forma léxica.
  return unique.sort();
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WINDOW_BACK_DAYS = 31;
const HORIZON_FWD_DAYS = 8;

/** Genera los vencimientos (dueAt) en el rango (anchor, until], cronológicos. */
function generateDailyDuesUntil(
  anchor: Date,
  dueTimes: string[],
  activeDays: number[] | null,
  until: Date
): Date[] {
  if (dueTimes.length === 0) return [];
  const result: Date[] = [];
  const anchorMs = anchor.getTime();
  const untilMs = until.getTime();
  const allDays = !activeDays || activeDays.length === 0;
  const day = startOfDay(anchor);
  const maxGuard = WINDOW_BACK_DAYS + HORIZON_FWD_DAYS + 5;
  let guard = 0;
  while (guard < maxGuard && day.getTime() <= untilMs) {
    guard++;
    if (allDays || activeDays!.includes(day.getDay())) {
      for (const t of dueTimes) {
        const due = timeOnDate(day, t);
        const ms = due.getTime();
        if (ms > anchorMs && ms <= untilMs) result.push(due);
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return result;
}

export interface DailyOccurrence {
  dueAt: Date;
  /** Fin de la ventana de gracia (dueAt + 2h). */
  graceEndsAt: Date;
  /** Si alguna completion la cubre (explícita por covered_due_at o legacy). */
  covered: boolean;
}

export interface DailyOccurrencesResult {
  occurrences: DailyOccurrence[];
  /** Ocurrencia pendiente = la más antigua sin cubrir con la gracia aún abierta. */
  pending: DailyOccurrence | null;
  anchor: Date;
}

const minuteKey = (ms: number): number => Math.floor(ms / 60000);

/**
 * Construye las ocurrencias de vencimiento de una tarea daily y marca cuáles
 * quedaron cubiertas por completions, respetando:
 *  - created_at (no genera vencimientos anteriores a la creación),
 *  - active_days,
 *  - la ventana de gracia de 2 h,
 *  - covered_due_at explícito (cubre exactamente esa ocurrencia),
 *  - completions legacy sin covered_due_at (se emparejan de forma compatible).
 *
 * `completions` debe venir ya filtrado a esta tarea.
 */
export function buildDailyOccurrences(
  task: Pick<
    TaskTemplate,
    "due_times" | "due_time" | "active_days" | "created_at"
  >,
  completions: TaskCompletion[],
  now: Date
): DailyOccurrencesResult {
  const dueTimes = normalizeDueTimes(task);
  const windowStart = new Date(now.getTime() - WINDOW_BACK_DAYS * ONE_DAY_MS);
  const createdAt = task.created_at ? new Date(task.created_at) : null;
  const anchor =
    createdAt && createdAt.getTime() > windowStart.getTime()
      ? createdAt
      : windowStart;

  if (dueTimes.length === 0) {
    return { occurrences: [], pending: null, anchor };
  }

  const until = new Date(now.getTime() + HORIZON_FWD_DAYS * ONE_DAY_MS);
  const dues = generateDailyDuesUntil(
    anchor,
    dueTimes,
    task.active_days ?? null,
    until
  );
  const occurrences: DailyOccurrence[] = dues.map((dueAt) => ({
    dueAt,
    graceEndsAt: new Date(dueAt.getTime() + GRACE_MS),
    covered: false,
  }));

  // 1) Completions con covered_due_at: cubren exactamente su ocurrencia.
  const explicitKeys = new Set<number>();
  const legacy: TaskCompletion[] = [];
  for (const c of completions) {
    if (c.covered_due_at) {
      explicitKeys.add(minuteKey(new Date(c.covered_due_at).getTime()));
    } else {
      legacy.push(c);
    }
  }
  for (const occ of occurrences) {
    if (explicitKeys.has(minuteKey(occ.dueAt.getTime()))) occ.covered = true;
  }

  // 2) Completions legacy: se emparejan con la ocurrencia sin cubrir del mismo
  // día (o la más antigua sin cubrir <= completed_at) para ser compatibles con
  // la atribución previa por completed_at.
  legacy.sort(
    (a, b) =>
      new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
  );
  for (const c of legacy) {
    const completedAt = new Date(c.completed_at);
    let target =
      occurrences.find(
        (o) => !o.covered && isSameLocalDay(o.dueAt, completedAt)
      ) ??
      occurrences.find(
        (o) => !o.covered && o.dueAt.getTime() <= completedAt.getTime()
      ) ??
      occurrences.find((o) => !o.covered);
    if (target) target.covered = true;
  }

  const pending =
    occurrences.find(
      (o) => !o.covered && o.graceEndsAt.getTime() >= now.getTime()
    ) ?? null;

  return { occurrences, pending, anchor };
}

export interface EveryNDaysDue {
  /** Día (00:00 local) en que la tarea vuelve a tocar. */
  dueDate: Date;
  /** Fin de la ventana de gracia = fin del día de vencimiento + EVERY_N_GRACE_DAYS. */
  graceEndsAt: Date;
  /** Si la tarea ya tiene al menos una completion previa. */
  hasHistory: boolean;
}

/**
 * Calcula el vencimiento actual de una tarea every_n_days (relativo a la última
 * completion) y su ventana de gracia de `EVERY_N_GRACE_DAYS` días. Devuelve null
 * si no aplica (otro tipo o sin intervalo válido).
 */
export function everyNDaysDue(
  task: Pick<
    TaskTemplate,
    "recurrence_type" | "interval_days" | "created_at"
  >,
  completions: TaskCompletion[],
  now: Date
): EveryNDaysDue | null {
  if (task.recurrence_type !== "every_n_days") return null;
  const interval = task.interval_days ?? 0;
  if (interval <= 0) return null;

  let last: TaskCompletion | null = null;
  for (const c of completions) {
    if (!last || new Date(c.completed_at) > new Date(last.completed_at)) last = c;
  }

  let dueDate: Date;
  if (last) {
    dueDate = startOfDay(new Date(last.completed_at));
    dueDate.setDate(dueDate.getDate() + interval);
  } else {
    // Nunca completada: se considera vencida desde su creación (o desde hoy).
    dueDate = startOfDay(task.created_at ? new Date(task.created_at) : now);
  }

  const graceEndsAt = new Date(
    startOfDay(dueDate).getTime() + (EVERY_N_GRACE_DAYS + 1) * ONE_DAY_MS
  );
  return { dueDate, graceEndsAt, hasHistory: last !== null };
}

/**
 * Calcula la ocurrencia que cubre una completion hecha "ahora":
 *  - la ocurrencia vencida sin cubrir más antigua con la gracia aún abierta
 *    (dueAt <= now <= dueAt + 2h), o si no
 *  - la siguiente ocurrencia futura pendiente (hoy o el próximo día activo).
 * Devuelve null para tareas sin horarios o every_n_days (fallback legacy).
 */
export function computeCoveredDueAt(
  task: TaskTemplate,
  completions: TaskCompletion[],
  now: Date
): Date | null {
  if (task.recurrence_type !== "daily") return null;
  const { pending } = buildDailyOccurrences(task, completions, now);
  return pending ? pending.dueAt : null;
}
