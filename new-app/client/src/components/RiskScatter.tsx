import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ReferenceLine,
} from "recharts";
import type { Line } from "../types";
import { usd, machineLabel } from "../format";

const BAND_COLOR: Record<string, string> = {
  critical: "#e5484d",
  elevated: "#f2711c",
  watch: "#f5a623",
  healthy: "#2f9e8f",
};

export default function RiskScatter({ lines, onSelect }: { lines: Line[]; onSelect?: (id: string) => void }) {
  const bands = ["healthy", "watch", "elevated", "critical"];
  const byBand = (b: string) => lines.filter((l) => l.risk_band === b);

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 20, bottom: 32, left: 8 }}>
          <CartesianGrid stroke="#eef0f3" />
          <XAxis
            type="number" dataKey="vibration_rms" name="Vibração" unit=" RMS"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            label={{ value: "Vibração (RMS)", position: "insideBottom", offset: -18, fontSize: 12, fill: "#6b7280" }}
          />
          <YAxis
            type="number" dataKey="failure_risk_score" name="Risco" domain={[0, 1]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            label={{ value: "Risco de falha", angle: -90, position: "insideLeft", fontSize: 12, fill: "#6b7280" }}
          />
          <ZAxis type="number" dataKey="downtime_exposure_usd" range={[30, 420]} name="Exposição" />
          <ReferenceLine y={0.75} stroke="#e5484d" strokeDasharray="4 4" />
          <ReferenceLine y={0.5} stroke="#f5a623" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const l = payload[0].payload as Line;
              return (
                <div className="card card-pad" style={{ padding: 12, boxShadow: "var(--shadow-md)" }}>
                  <div className="strong">{l.line_id}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {machineLabel(l.machine_type)} · {l.plant_id}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Risco {Math.round(l.failure_risk_score * 100)}% · Vib {l.vibration_rms.toFixed(2)}
                    <br />
                    Exposição {usd(l.downtime_exposure_usd)}
                  </div>
                </div>
              );
            }}
          />
          {bands.map((b) => (
            <Scatter
              key={b}
              data={byBand(b)}
              fill={BAND_COLOR[b]}
              fillOpacity={b === "healthy" ? 0.35 : 0.8}
              onClick={(d: any) => onSelect?.(d.line_id)}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
