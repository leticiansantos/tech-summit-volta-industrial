import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { bandLabel } from "../format";

export function RiskBadge({ band }: { band: string }) {
  return (
    <span className={`risk-badge risk-${band}`}>
      <span className="dot" />
      {bandLabel[band] || band}
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Loading({ text = "Carregando…" }: { text?: string }) {
  return (
    <div className="center-load">
      <Spinner /> {text}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="card card-pad" style={{ borderColor: "var(--critical)", background: "var(--critical-soft)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--critical)", fontWeight: 700 }}>
        <AlertTriangle size={18} /> Erro ao carregar dados
      </div>
      <div className="mono" style={{ marginTop: 8, fontSize: 12 }}>{error}</div>
    </div>
  );
}

export function KpiCard({
  label, value, foot, icon, accent,
}: {
  label: string; value: ReactNode; foot?: string; icon?: ReactNode; accent?: "critical" | "watch" | "healthy";
}) {
  return (
    <div className={`kpi${accent ? ` accent-${accent}` : ""}`}>
      <div className="label">
        {icon}
        {label}
      </div>
      <div className="value">{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Card({ title, hint, children, actions }: { title?: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="card">
      {(title || actions) && (
        <div className="card-head">
          <div>
            <h3>{title}</h3>
            {hint && <div className="hint">{hint}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
