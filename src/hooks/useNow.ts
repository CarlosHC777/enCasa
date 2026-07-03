"use client";

import { useEffect, useState } from "react";

/** Returns the current time, refreshed every `intervalMs` (default 1 min). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
