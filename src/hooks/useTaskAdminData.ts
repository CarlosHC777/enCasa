"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAllTaskTemplates, fetchProfiles, fetchZones } from "@/lib/data";
import type { Profile, TaskTemplate, Zone } from "@/types/domain";

interface TaskAdminData {
  zones: Zone[];
  profiles: Profile[];
  tasks: TaskTemplate[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTaskAdminData(): TaskAdminData {
  const [zones, setZones] = useState<Zone[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchZones(), fetchProfiles(), fetchAllTaskTemplates()])
      .then(([zonesData, profilesData, tasksData]) => {
        if (cancelled) return;
        setZones(zonesData);
        setProfiles(profilesData);
        setTasks(tasksData);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error cargando datos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  return { zones, profiles, tasks, loading, error, refresh };
}
