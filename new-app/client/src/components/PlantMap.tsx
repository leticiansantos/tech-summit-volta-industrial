import { useMemo, useState } from "react";
import type { Line } from "../types";
import { usd } from "../format";

// Self-contained geo bubble map: projects plant lat/lng onto an SVG with a
// simple equirectangular projection (no external tiles). One bubble per plant,
// sized by exposure and colored by its worst risk band.

const BAND_COLOR: Record<string, string> = {
  critical: "#e5484d",
  elevated: "#f2711c",
  watch: "#f5a623",
  healthy: "#2f9e8f",
};
const BAND_RANK: Record<string, number> = { critical: 3, elevated: 2, watch: 1, healthy: 0 };

interface PlantAgg {
  plant_id: string;
  lat: number;
  lng: number;
  exposure: number;
  atrisk: number;
  worst: string;
}

export default function PlantMap({ lines }: { lines: Line[] }) {
  const [hover, setHover] = useState<PlantAgg | null>(null);
  const W = 720;
  const H = 360;
  const PAD = 46;

  const plants = useMemo<PlantAgg[]>(() => {
    const map = new Map<string, PlantAgg>();
    for (const l of lines) {
      if (l.plant_lat == null || l.plant_lng == null) continue;
      const cur =
        map.get(l.plant_id) ||
        { plant_id: l.plant_id, lat: l.plant_lat, lng: l.plant_lng, exposure: 0, atrisk: 0, worst: "healthy" };
      cur.exposure += l.downtime_exposure_usd || 0;
      if (l.risk_band !== "healthy") cur.atrisk += 1;
      if (BAND_RANK[l.risk_band] > BAND_RANK[cur.worst]) cur.worst = l.risk_band;
      cur.lat = l.plant_lat;
      cur.lng = l.plant_lng;
      map.set(l.plant_id, cur);
    }
    return [...map.values()];
  }, [lines]);

  const bounds = useMemo(() => {
    const lats = plants.map((p) => p.lat);
    const lngs = plants.map((p) => p.lng);
    return {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
    };
  }, [plants]);

  const maxExp = Math.max(1, ...plants.map((p) => p.exposure));
  const project = (p: PlantAgg) => {
    const { minLat, maxLat, minLng, maxLng } = bounds;
    const x = PAD + ((p.lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * PAD);
    const y = PAD + ((maxLat - p.lat) / (maxLat - minLat || 1)) * (H - 2 * PAD);
    return { x, y };
  };
  const radius = (p: PlantAgg) => 12 + (p.exposure / maxExp) * 30;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <rect x={0} y={0} width={W} height={H} fill="#fbfbfc" rx={10} />
        {/* faint grid */}
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={`v${i}`} x1={PAD + (i * (W - 2 * PAD)) / 6} y1={PAD} x2={PAD + (i * (W - 2 * PAD)) / 6} y2={H - PAD} stroke="#eef0f3" />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={`h${i}`} x1={PAD} y1={PAD + (i * (H - 2 * PAD)) / 4} x2={W - PAD} y2={PAD + (i * (H - 2 * PAD)) / 4} stroke="#eef0f3" />
        ))}
        {plants.map((p) => {
          const { x, y } = project(p);
          const r = radius(p);
          const c = BAND_COLOR[p.worst];
          return (
            <g key={p.plant_id} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r={r} fill={c} fillOpacity={0.18} />
              <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={2} />
              <circle cx={x} cy={y} r={4} fill={c} />
              <text x={x} y={y - r - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1a1a1a">
                {p.plant_id}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div
          className="card card-pad"
          style={{ position: "absolute", top: 10, right: 10, padding: 12, boxShadow: "var(--shadow-md)", pointerEvents: "none" }}
        >
          <div className="strong">{hover.plant_id}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Exposição {usd(hover.exposure)}
            <br />
            {hover.atrisk} linha(s) em risco
          </div>
        </div>
      )}
    </div>
  );
}
