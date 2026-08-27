import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { PlantRollup } from "../types";
import { usd, num, pct } from "../format";

// Ranked plant list: the $ exposure of each plant is the hero number, and the
// plants most at risk (highest share of critical lines) are visually promoted.

type Level = "critical" | "elevated" | "watch";
const LEVEL_COLOR: Record<Level, string> = {
  critical: "var(--critical)",
  elevated: "var(--elevated)",
  watch: "var(--volta-primary)",
};
const LEVEL_SOFT: Record<Level, string> = {
  critical: "var(--critical-soft)",
  elevated: "var(--elevated-soft)",
  watch: "var(--volta-primary-soft)",
};

export default function PlantExposure({ plants }: { plants: PlantRollup[] }) {
  const ranked = useMemo(() => [...plants].sort((a, b) => b.exposure - a.exposure), [plants]);
  const maxExp = Math.max(1, ...ranked.map((p) => p.exposure));
  const maxCrit = Math.max(1, ...ranked.map((p) => p.critical));

  const levelFor = (p: PlantRollup): Level => {
    const ratio = p.critical / maxCrit;
    if (ratio >= 0.85) return "critical";
    if (ratio >= 0.6) return "elevated";
    return "watch";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {ranked.map((p, i) => {
        const level = levelFor(p);
        const color = LEVEL_COLOR[level];
        const priority = level === "critical";
        return (
          <div
            key={p.plant_id}
            style={{
              border: "1px solid var(--border)",
              borderLeft: `4px solid ${color}`,
              borderRadius: "var(--radius-sm)",
              padding: "12px 14px",
              background: priority ? `linear-gradient(90deg, ${LEVEL_SOFT[level]}, var(--surface) 55%)` : "var(--surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ color: "var(--text-faint)", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  #{i + 1}
                </span>
                <span className="strong" style={{ fontSize: 14 }}>{p.plant_id}</span>
                {priority && (
                  <span
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700,
                      color: "var(--critical)", background: "var(--critical-soft)", padding: "2px 7px", borderRadius: 999,
                    }}
                  >
                    <AlertTriangle size={11} /> Prioridade
                  </span>
                )}
              </div>
              {/* Hero value */}
              <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                {usd(p.exposure)}
              </span>
            </div>

            {/* Proportional bar */}
            <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 5, marginTop: 10, overflow: "hidden" }}>
              <div
                style={{
                  width: `${(p.exposure / maxExp) * 100}%`,
                  height: "100%",
                  background: color,
                  opacity: 0.9,
                  borderRadius: 5,
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            {/* Meta */}
            <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "var(--text-muted)", flexWrap: "wrap" }}>
              <span>
                <b style={{ color }}>{num(p.critical)}</b> críticas
              </span>
              <span><b style={{ color: "var(--text)" }}>{num(p.atrisk)}</b> em risco</span>
              <span>de {num(p.lines)} linhas</span>
              <span style={{ marginLeft: "auto" }}>risco médio <b style={{ color: "var(--text)" }}>{pct(p.avg_risk)}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
