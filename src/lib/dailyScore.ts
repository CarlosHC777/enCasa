import type {
  DailyScore,
  DailyScoreOccurrence,
  PersonDailyScore,
  Profile,
  TaskCompletion,
  TaskTemplate,
} from "@/types/domain";
import {
  buildDailyOccurrences,
  everyNDaysDue,
  isDayApplicable,
  isSameLocalDay,
  startOfDay,
} from "@/lib/schedule";

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
 *  - every_n_days: 1 ocurrencia si la tarea vence hoy o está dentro de su
 *    ventana de gracia de 1 día (o fue completada hoy). Si aún no toca, o si ya
 *    pasó la gracia sin completarse, no cuenta para el día (deja de arrastrar el
 *    score cada día). Una tarea nunca completada queda pendiente hasta hacerla.
 */
export function taskOccurrencesToday(
  task: TaskTemplate,
  completionsForTask: TaskCompletion[],
  now: Date
): DailyScoreOccurrence[] {
  if (!task.enabled || !task.assigned_to) return [];
  if (!isDayApplicable(task, now)) return [];

  const assignedTo = task.assigned_to;

  const make = (completed: boolean): DailyScoreOccurrence => ({
    taskId: task.id,
    taskTitle: task.title,
    assignedTo,
    completed,
  });

  if (task.recurrence_type === "daily") {
    // Ocurrencias del día local; `covered` ya respeta covered_due_at y la
    // ventana de gracia (una completion cubre a lo sumo una ocurrencia, así
    // que nunca se cuentan de más). Las ocurrencias no cubiertas cuya gracia
    // expiró quedan como "perdidas" (cuentan en el total, no en completadas).
    const { occurrences } = buildDailyOccurrences(task, completionsForTask, now);
    const today = occurrences.filter((o) => isSameLocalDay(o.dueAt, now));
    return today.map((o) => make(o.covered));
  }

  // every_n_days con ventana de gracia de 1 día.
  const completionsToday = completionsForTask.filter((c) =>
    isSameLocalDay(new Date(c.completed_at), now)
  );
  if (completionsToday.length > 0) return [make(true)]; // completada hoy (incluye a tiempo o 1 día tarde)

  const due = everyNDaysDue(task, completionsForTask, now);
  if (!due) return [];

  // Nunca completada: sigue pendiente cada día hasta la primera vez.
  if (!due.hasHistory) return [make(false)];

  // Cuenta como ocurrencia pendiente sólo si hoy es el día de vencimiento o su
  // día de gracia; pasada la gracia sin completarse, deja de contar.
  const startTodayMs = startOfDay(now).getTime();
  const withinWindow =
    startTodayMs >= startOfDay(due.dueDate).getTime() &&
    now.getTime() < due.graceEndsAt.getTime();
  return withinWindow ? [make(false)] : [];
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
