"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ZoneCard } from "@/components/ZoneCard";
import { ZoneModal } from "@/components/ZoneModal";
import { UrgencyLegend } from "@/components/UrgencyLegend";
import { useActiveProfile } from "@/context/ProfileContext";
import { completeTask } from "@/lib/data";
import { logoutPin } from "@/lib/pinClient";
import { DEFAULT_FLOOR_ID, FLOOR_PLANS, type FloorId } from "@/lib/floorPlans";
import { computeTaskStatus, computeZoneUrgency } from "@/lib/urgency";
import { useHouseData } from "@/hooks/useHouseData";
import { useNow } from "@/hooks/useNow";
import type { TaskStatus, Zone } from "@/types/domain";

export default function HomePage() {
  const router = useRouter();
  const { activeProfileId, ready, clearActiveProfile } = useActiveProfile();
  const { zones, profiles, tasks, completions, loading, error, refresh } =
    useHouseData();
  const now = useNow();

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeFloorId, setActiveFloorId] = useState<FloorId>(DEFAULT_FLOOR_ID);
  const [mapZoom, setMapZoom] = useState(1);

  const MAP_ZOOM_MIN = 0.4;
  const MAP_ZOOM_MAX = 2;
  const zoomOut = () =>
    setMapZoom((z) => Math.max(MAP_ZOOM_MIN, Math.round((z - 0.1) * 10) / 10));
  const zoomIn = () =>
    setMapZoom((z) => Math.min(MAP_ZOOM_MAX, Math.round((z + 0.1) * 10) / 10));
  const resetZoom = () => setMapZoom(1);

  useEffect(() => {
    if (ready && !activeProfileId) {
      router.replace("/login");
    }
  }, [ready, activeProfileId, router]);

  const profilesById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );

  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  const activeFloor =
    FLOOR_PLANS.find((floor) => floor.id === activeFloorId) ?? FLOOR_PLANS[0];

  const visibleZones = useMemo(
    () =>
      activeFloor.zoneIds
        .map((id) => zonesById.get(id))
        .filter((zone): zone is Zone => Boolean(zone)),
    [activeFloor, zonesById]
  );

  const completionsByTask = useMemo(() => {
    const map = new Map<string, typeof completions>();
    for (const completion of completions) {
      const list = map.get(completion.task_template_id) ?? [];
      list.push(completion);
      map.set(completion.task_template_id, list);
    }
    return map;
  }, [completions]);

  const statusesByZone = useMemo(() => {
    const map = new Map<string, TaskStatus[]>();
    for (const task of tasks) {
      const taskCompletions = completionsByTask.get(task.id) ?? [];
      const status = computeTaskStatus(task, taskCompletions, now);
      const list = map.get(task.zone_id) ?? [];
      list.push(status);
      map.set(task.zone_id, list);
    }
    return map;
  }, [tasks, completionsByTask, now]);

  const activeProfile = activeProfileId ? profilesById.get(activeProfileId) : undefined;
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  async function handleComplete(taskTemplateId: string) {
    if (!activeProfileId) return;
    setCompletingTaskId(taskTemplateId);
    setActionError(null);
    try {
      await completeTask(taskTemplateId, activeProfileId);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "No se pudo completar la tarea"
      );
    } finally {
      setCompletingTaskId(null);
    }
  }

  function handleSwitchProfile() {
    clearActiveProfile();
    router.replace("/login");
  }

  async function handleLogoutPin() {
    await logoutPin();
    router.replace("/pin");
  }

  if (!ready || !activeProfileId) {
    return null;
  }

  return (
    <div className="page">
      <header className="app-header">
        <h1>enCasa</h1>
        <div className="profile-badge">
          <Link href="/tareas" className="link-button">
            Administrar tareas
          </Link>
          <Link href="/historial" className="link-button">
            Historial
          </Link>
          <span>{activeProfile?.name ?? "…"}</span>
          <button type="button" className="link-button" onClick={handleSwitchProfile}>
            Cambiar
          </button>
          <button type="button" className="link-button" onClick={handleLogoutPin}>
            Salir
          </button>
        </div>
      </header>

      <main className="container">
        {loading && <div className="status-banner">Cargando la casa…</div>}
        {error && <div className="status-banner error">{error}</div>}
        {actionError && <div className="status-banner error">{actionError}</div>}

        {!loading && !error && (
          <>
            <div className="floor-switcher" role="tablist" aria-label="Piso">
              {FLOOR_PLANS.map((floor) => (
                <button
                  key={floor.id}
                  type="button"
                  role="tab"
                  aria-selected={floor.id === activeFloor.id}
                  className={`floor-tab${floor.id === activeFloor.id ? " active" : ""}`}
                  onClick={() => setActiveFloorId(floor.id)}
                >
                  {floor.label}
                </button>
              ))}
            </div>

            <div className="map-controls" role="group" aria-label="Zoom del mapa">
              <button
                type="button"
                className="map-zoom-button"
                onClick={zoomOut}
                disabled={mapZoom <= MAP_ZOOM_MIN}
                aria-label="Alejar"
              >
                −
              </button>
              <span className="map-zoom-value" aria-live="polite">
                {Math.round(mapZoom * 100)}%
              </span>
              <button
                type="button"
                className="map-zoom-button"
                onClick={zoomIn}
                disabled={mapZoom >= MAP_ZOOM_MAX}
                aria-label="Acercar"
              >
                +
              </button>
              <button type="button" className="map-zoom-reset" onClick={resetZoom}>
                100%
              </button>
            </div>

            <div className="zone-map-viewport">
              <div
                className={`zone-map zone-map--${activeFloor.id}`}
                style={{ zoom: mapZoom }}
              >
                {visibleZones.map((zone) => {
                  const statuses = statusesByZone.get(zone.id) ?? [];
                  const urgency = computeZoneUrgency(statuses);
                  return (
                    <ZoneCard
                      key={zone.id}
                      zone={zone}
                      urgency={urgency}
                      onClick={() => setSelectedZoneId(zone.id)}
                    />
                  );
                })}
              </div>
            </div>

            <UrgencyLegend />
          </>
        )}
      </main>

      {selectedZone && (
        <ZoneModal
          zone={selectedZone}
          statuses={statusesByZone.get(selectedZone.id) ?? []}
          profilesById={profilesById}
          now={now}
          onClose={() => setSelectedZoneId(null)}
          onComplete={handleComplete}
          completingTaskId={completingTaskId}
        />
      )}
    </div>
  );
}
