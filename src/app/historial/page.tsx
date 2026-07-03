"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveProfile } from "@/context/ProfileContext";
import { fetchProfiles } from "@/lib/data";
import { useTaskHistory } from "@/hooks/useTaskHistory";
import type { Profile } from "@/types/domain";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistorialPage() {
  const router = useRouter();
  const { activeProfileId, ready, clearActiveProfile } = useActiveProfile();
  const { entries, loading, error } = useTaskHistory(50);

  const [personFilter, setPersonFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (ready && !activeProfileId) {
      router.replace("/login");
    }
  }, [ready, activeProfileId, router]);

  useEffect(() => {
    fetchProfiles()
      .then(setProfiles)
      .catch(() => {
        // Header name falls back to the id below; not worth a banner here.
      });
  }, []);

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) map.set(entry.completedById, entry.completedByName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [entries]);

  const zonesInHistory = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) map.set(entry.zoneId, entry.zoneName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [entries]);

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!personFilter || entry.completedById === personFilter) &&
          (!zoneFilter || entry.zoneId === zoneFilter)
      ),
    [entries, personFilter, zoneFilter]
  );

  const hasActiveFilters = personFilter !== "" || zoneFilter !== "";
  const activeProfileName =
    profiles.find((p) => p.id === activeProfileId)?.name ?? activeProfileId ?? "…";

  function handleClearFilters() {
    setPersonFilter("");
    setZoneFilter("");
  }

  if (!ready || !activeProfileId) {
    return null;
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>enCasa</h1>
        <div className="profile-badge">
          <Link href="/" className="link-button">
            Volver al mapa
          </Link>
          <Link href="/tareas" className="link-button">
            Administrar tareas
          </Link>
          <span>{activeProfileName}</span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              clearActiveProfile();
              router.replace("/login");
            }}
          >
            Cambiar
          </button>
        </div>
      </header>

      <main className="container">
        <h2>Historial</h2>

        {loading && <div className="status-banner">Cargando historial…</div>}
        {error && <div className="status-banner error">{error}</div>}

        {!loading && !error && (
          <>
            <div className="history-filters">
              <div className="form-field">
                <label htmlFor="filter-person">Persona</label>
                <select
                  id="filter-person"
                  value={personFilter}
                  onChange={(e) => setPersonFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="filter-zone">Zona</label>
                <select
                  id="filter-zone"
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {zonesInHistory.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="button-secondary"
                onClick={handleClearFilters}
                disabled={!hasActiveFilters}
              >
                Limpiar filtros
              </button>
            </div>

            {filteredEntries.length === 0 ? (
              <p className="empty-state">
                {entries.length === 0
                  ? "Todavía no hay tareas completadas."
                  : "Ninguna completion coincide con los filtros."}
              </p>
            ) : (
              <div className="history-list">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="history-entry">
                    <p className="history-entry-title">{entry.taskTitle}</p>
                    <div className="history-entry-meta">
                      <span>Zona: {entry.zoneName}</span>
                      <span>Completó: {entry.completedByName}</span>
                      <span>{formatDateTime(entry.completedAt)}</span>
                      {entry.assignedToName && (
                        <span>Responsable: {entry.assignedToName}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
