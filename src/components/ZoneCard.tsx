"use client";

import type { UrgencyLevel, Zone } from "@/types/domain";

const URGENCY_CLASS: Record<UrgencyLevel, string> = {
  green: "zone-green",
  yellow: "zone-yellow",
  orange: "zone-orange",
  red: "zone-red",
};

interface ZoneCardProps {
  zone: Zone;
  urgency: UrgencyLevel;
  onClick: () => void;
}

export function ZoneCard({ zone, urgency, onClick }: ZoneCardProps) {
  return (
    <button
      type="button"
      className={`zone-card ${URGENCY_CLASS[urgency]}`}
      data-zone={zone.id}
      onClick={onClick}
    >
      <span className="dot" aria-hidden />
      <span className="zone-name">{zone.name}</span>
    </button>
  );
}
