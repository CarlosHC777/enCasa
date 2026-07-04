"use client";

interface ClockProps {
  now: Date;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function Clock({ now }: ClockProps) {
  const time = now.toLocaleTimeString("es-MX", {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = capitalize(
    now.toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
  );

  return (
    <div className="clock">
      <span className="clock-time">{time}</span>
      <span className="clock-date">{date}</span>
    </div>
  );
}
