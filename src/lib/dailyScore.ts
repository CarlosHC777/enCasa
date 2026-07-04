import type {
  DailyScore,
  DailyScoreOccurrence,
  PersonDailyScore,
  Profile,
  TaskCompletion,
  TaskTemplate,
} from "@/types/domain";
import {
  computeTaskStatus,
  isDayApplicable,
  normalizeDueTimes,
} from "@/lib/urgency";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Genera las ocurrencias de vencimiento de UNA tarea para el día local de
 * `now`, marcando cuáles quedaron cubiertas por completions de hoy.
 *
 * Reglas:
 *  - Sólo tareas enabled y con `assigned_to` (las demás no puntúan).
 *  - Respeta `active_days` (si hoy no es día activo → sin ocurrencias).
 *  - daily: una ocurrencia por cada horario de `due_times` (o 1 por `due_time`
 *    legacy). Las completions de hoy cubren ocurrencias 1 a 1, con tope en el
 *    número de ocurrencias (no cuentan de más).
 *  - every_n_days: 1 ocurrencia si la tarea vence/toca hoy (o fue completada
 *    hoy); si aún no toca, no cuenta para el día.
 */
export function taskOccurrencesToday(
  task: TaskTemplate,
  completionsForTask: TaskCompletion[],
  now: Date
): DailyScoreOccurrence[] {
  if (!task.enabled || !task.assigned_to) return [];
  if (!isDayApplicable(task, now)) return [];

  const assignedTo = task.assigned_to;
  const completionsToday = completionsForTask.filter((c) =>
    isSameLocalDay(new Date(c.completed_at), now)
  );

  const make = (completed: boolean): DailyScoreOccurrence => ({
    taskId: task.id,
    taskTitle: task.title,
    assignedTo,
    completed,
  });

  if (task.recurrence_type === "daily") {
    const occurrences = normalizeDueTimes(task).length;
    if (occurrences === 0) return []; // sin horarios: no se puede puntuar
    const completedCount = Math.min(completionsToday.length, occurrences);
    return Array.from({ length: occurrences }, (_, i) =>
      make(i < completedCount)
    );
  }

  // every_n_days
  if (completionsToday.length > 0) return [make(true)];
  const status = computeTaskStatus(task, completionsForTask, now);
  // `overdue` cubre "vence hoy" (daysSince === interval) y "vencida"
  // (daysSince > interval), incluyendo tareas sin historial.
  if (status.state === "overdue") return [make(false)];
  return [];
}

/**
 * Score diario puro para el día local de `now`. No borra ni modifica datos:
 * cada llamada recalcula desde las completions existentes, así que al cambiar
 * de día el score se "reinicia" solo (las completions de ayer dejan de contar).
 */
export function calculateDailyScore(
  tasks: TaskTemplate[],
  profiles: Profile[],
  completions: TaskCompletion[],
  now: Date
): DailyScore {
  const completionsByTask = new Map<string, TaskCompletion[]>();
  for (const completion of completions) {
    const list = completionsByTask.get(completion.task_template_id) ?? [];
    list.push(completion);
    completionsByTask.set(completion.task_template_id, list);
  }

  const occurrences: DailyScoreOccurrence[] = [];
  for (const task of tasks) {
    const taskCompletions = completionsByTask.get(task.id) ?? [];
    occurrences.push(...taskOccurrencesToday(task, taskCompletions, now));
  }

  const totals = new Map<string, { total: number; completed: number }>();
  for (const occ of occurrences) {
    const entry = totals.get(occ.assignedTo) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (occ.completed) entry.completed += 1;
    totals.set(occ.assignedTo, entry);
  }

  const people: PersonDailyScore[] = profiles.map((profile) => {
    const entry = totals.get(profile.id) ?? { total: 0, completed: 0 };
    return {
      profileId: profile.id,
      name: profile.name,
      totalAssignedToday: entry.total,
      completedToday: entry.completed,
      percentage: entry.total > 0 ? entry.completed / entry.total : null,
    };
  });

  const houseTotal = occurrences.length;
  const houseCompleted = occurrences.filter((o) => o.completed).length;

  return {
    house: {
      totalAssignedToday: houseTotal,
      completedToday: houseCompleted,
      percentage: houseTotal > 0 ? houseCompleted / houseTotal : null,
    },
    people,
  };
}
