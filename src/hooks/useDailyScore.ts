"use client";

import { useMemo } from "react";
import { calculateDailyScore } from "@/lib/dailyScore";
import type {
  DailyScore,
  Profile,
  TaskCompletion,
  TaskTemplate,
} from "@/types/domain";

/**
 * Deriva el score diario a partir de los datos ya cargados por `useHouseData`
 * (sin fetch extra). Se recalcula cuando cambian tareas/completions o cuando
 * cambia el día local de `now`, por lo que el score se reinicia solo al pasar
 * de medianoche sin borrar historial.
 */
export function useDailyScore(
  tasks: TaskTemplate[],
  profiles: Profile[],
  completions: TaskCompletion[],
  now: Date
): DailyScore {
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  return useMemo(
    () => calculateDailyScore(tasks, profiles, completions, now),
    // `dayKey` representa el día local; evita recalcular cada minuto salvo
    // que cambien los datos o el día.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, profiles, completions, dayKey]
  );
}
