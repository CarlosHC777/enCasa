"use client";

import type { DailyScore, PersonDailyScore } from "@/types/domain";

/** Nivel de color suave según el porcentaje (null = sin tareas hoy). */
function scoreLevel(percentage: number | null): string {
  if (percentage === null) return "none";
  if (percentage >= 0.8) return "green";
  if (percentage >= 0.5) return "yellow";
  if (percentage > 0) return "orange";
  return "red";
}

function formatPercentage(percentage: number | null): string {
  if (percentage === null) return "—";
  return `${Math.round(percentage * 100)}%`;
}

interface ScoreBarProps {
  percentage: number | null;
}

function ScoreBar({ percentage }: ScoreBarProps) {
  const level = scoreLevel(percentage);
  const width = percentage === null ? 0 : Math.round(percentage * 100);
  return (
    <div
      className="score-bar"
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`score-bar-fill score-fill-${level}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

interface DailyScoreBoardProps {
  score: DailyScore;
}

export function DailyScoreBoard({ score }: DailyScoreBoardProps) {
  const { house, people } = score;

  return (
    <section className="score-board" aria-label="Score del día">
      <div className="score-house">
        <div className="score-house-head">
          <span className="score-house-label">Casa</span>
          <span className={`score-house-pct score-text-${scoreLevel(house.percentage)}`}>
            {formatPercentage(house.percentage)}
          </span>
        </div>
        <ScoreBar percentage={house.percentage} />
        <span className="score-caption">
          {house.percentage === null
            ? "Sin tareas para hoy"
            : `${house.completedToday} / ${house.totalAssignedToday} completadas`}
        </span>
      </div>

      <div className="score-people">
        {people.map((person) => (
          <PersonRow key={person.profileId} person={person} />
        ))}
      </div>
    </section>
  );
}

function PersonRow({ person }: { person: PersonDailyScore }) {
  const level = scoreLevel(person.percentage);
  return (
    <div className="score-row">
      <div className="score-row-head">
        <span className="score-name">{person.name}</span>
        <span className={`score-row-meta score-text-${level}`}>
          {person.percentage === null
            ? "Sin tareas para hoy"
            : `${person.completedToday}/${person.totalAssignedToday} · ${formatPercentage(person.percentage)}`}
        </span>
      </div>
      <ScoreBar percentage={person.percentage} />
    </div>
  );
}
