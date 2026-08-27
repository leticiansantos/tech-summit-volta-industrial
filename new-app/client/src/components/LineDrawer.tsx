import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line as RLine, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PackageCheck, PackageX, StickyNote, Wrench, X } from "lucide-react";
import { api } from "../api";
import type { LineDetail, RankedAction } from "../types";
import { RiskBadge, Spinner } from "./ui";
import { usd, pct, num, machineLabel, actionLabel } from "../format";

export default function LineDrawer({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<LineDetail>();
  const [error, setError] = useState("");

  useEffect(() => {
    setDetail(undefined);
    api.line(lineId).then(setDetail).catch((e) => setError(e.message));
  }, [lineId]);

  const line = detail?.line;
  const ranking: RankedAction[] = line?.action_ranking ? safeParse(line.action_ranking) : [];
  const maxNet = Math.max(1, ...ranking.map((r) => Math.abs(r.net_value)));

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="strong" style={{ fontSize: 18 }}>{lineId}</span>
              {line && <RiskBadge band={line.risk_band} />}
            </div>
            {line && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {machineLabel(line.machine_type)} · {line.plant_id} · criticidade {line.criticality}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: "18px 22px 28px" }}>
          {error && <div className="mono" style={{ color: "var(--critical)" }}>{error}</div>}
          {!detail && !error && (
            <div className="center-load"><Spinner /> Carregando detalhes…</div>
          )}
          {line && (
            <>
              <div className="stat-grid" style={{ marginBottom: 16 }}>
                <Cell k="Risco de falha" v={pct(line.failure_risk_score)} />
                <Cell k="Exposição a downtime" v={usd(line.downtime_exposure_usd)} />
                <Cell k="Vibração" v={`${line.vibration_rms?.toFixed(2)} RMS`} />
                <Cell k="Temperatura" v={`${line.temperature_c?.toFixed(1)} °C`} />
                <Cell k="Utilização" v={`${line.utilization_pct?.toFixed(0)}%`} />
                <Cell k="Corretivos abertos" v={num(line.open_wo_count)} />
              </div>

              {/* Parts logistics */}
              <div className="section-title">Peça de reposição</div>
              <div className="card card-pad" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
                {line.part_local ? (
                  <PackageCheck size={22} color="var(--healthy)" />
                ) : (
                  <PackageX size={22} color="var(--critical)" />
                )}
                <div style={{ flex: 1 }}>
                  <div className="strong mono">{line.candidate_part_id || "—"}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {line.part_local ? "Estocada localmente" : "Não estocada — precisa expedir"}
                    {line.part_lead_time_days != null && ` · lead time ${line.part_lead_time_days} dias`}
                    {line.part_unit_cost_usd != null && ` · ${usd(line.part_unit_cost_usd)}`}
                  </div>
                </div>
              </div>

              {/* Technician note */}
              {detail.note?.technician_note_text && (
                <>
                  <div className="section-title">Nota do técnico</div>
                  <div className="card card-pad" style={{ marginBottom: 16, display: "flex", gap: 10 }}>
                    <StickyNote size={18} color="var(--watch)" />
                    <div style={{ fontSize: 13, fontStyle: "italic" }}>“{detail.note.technician_note_text}”</div>
                  </div>
                </>
              )}

              {/* Telemetry trend */}
              <div className="section-title">Telemetria (últimos {detail.telemetry.length} dias)</div>
              <div style={{ height: 180, marginBottom: 18 }}>
                <ResponsiveContainer>
                  <LineChart data={detail.telemetry} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" />
                    <XAxis dataKey="telemetry_date" tick={{ fontSize: 9, fill: "#9aa1ac" }} minTickGap={40} />
                    <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }} />
                    <RLine yAxisId="l" type="monotone" dataKey="vibration_rms" name="Vibração" stroke="#f26522" strokeWidth={2} dot={false} />
                    <RLine yAxisId="r" type="monotone" dataKey="temperature_c" name="Temp °C" stroke="#3c6997" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Ranked actions */}
              {ranking.length > 0 && (
                <>
                  <div className="section-title">Ações ranqueadas pelo modelo</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {ranking
                      .slice()
                      .sort((a, b) => b.net_value - a.net_value)
                      .map((r, i) => (
                        <div key={r.action} className="card card-pad" style={{ padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {i === 0 && <span className="pill action">Recomendado</span>}
                              <span className="strong">{actionLabel(r.action)}</span>
                            </div>
                            <span className="strong" style={{ color: r.net_value >= 0 ? "var(--healthy)" : "var(--critical)" }}>
                              {usd(r.net_value)}
                            </span>
                          </div>
                          <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
                            <div
                              style={{
                                width: `${(Math.abs(r.net_value) / maxNet) * 100}%`,
                                height: "100%",
                                background: r.net_value >= 0 ? "var(--healthy)" : "var(--critical)",
                              }}
                            />
                          </div>
                          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                            Downtime evitado {usd(r.avoided)} · custo da ação {usd(r.cost)}
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}

              <Link to="/manutencao" state={{ lineId }} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                <Wrench size={16} /> Gerar plano de manutenção
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="cell">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function safeParse(s: string): RankedAction[] {
  try {
    return typeof s === "string" ? JSON.parse(s) : (s as unknown as RankedAction[]);
  } catch {
    return [];
  }
}
