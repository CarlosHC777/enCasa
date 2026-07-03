"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTaskCompletionHistory } from "@/lib/data";
import type { TaskCompletionHistoryEntry } from "@/types/domain";

interface TaskHistoryData {
  entries: TaskCompletionHistoryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTaskHistory(limit = 50): TaskHistoryData {
  const [entries, setEntries] = useState<TaskCompletionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTaskCompletionHistory(limit)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error cargando el historial");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [limit, refreshToken]);

  return { entries, loading, error, refresh };
}
