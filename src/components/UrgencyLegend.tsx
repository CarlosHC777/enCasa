"use client";

import { urgencyShortLabel } from "@/lib/urgency";
import type { UrgencyLevel } from "@/types/domain";

const URGENCY_CLASS: Record<UrgencyLevel, string> = {
  green: "zone-green",
  yellow: "zone-yellow",
  orange: "zone-orange",
  red: "zone-red",
};

const LEVELS: UrgencyLevel[] = ["green", "yellow", "orange", "red"];

export function UrgencyLegend() {
  return (
    <div className="urgency-legend" aria-label="Leyenda de colores por urgencia">
      {LEVELS.map((level) => (
        <span key={level} className={`urgency-legend-item ${URGENCY_CLASS[level]}`}>
          <span className="dot" aria-hidden />
          {urgencyShortLabel(level)}
        </span>
      ))}
    </div>
  );
}
