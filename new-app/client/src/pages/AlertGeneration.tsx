import { useEffect, useState } from "react";
import { Bell, Check, Copy, Database, Mail, Play, Send } from "lucide-react";
import { api } from "../api";
import type { AlertResult, AlertHistory } from "../types";
import { Card, Loading, ErrorBox, RiskBadge, Spinner } from "../components/ui";
import { usd, pct, num, machineLabel } from "../format";

export default function AlertGeneration() {
  const [opts, setOpts] = useState<{ plants: string[]; machineTypes: string[] }>();
  const [minRisk, setMinRisk] = useState(0.75);
  const [minVib, setMinVib] = useState(0);
  const [minTemp, setMinTemp] = useState(0);
  const [requireCorrective, setRequireCorrective] = useState(false);
  const [plants, setPlants] = useState<string[]>([]);
  const [machineTypes, setMachineTypes] = useState<string[]>([]);

  const [result, setResult] = useState<AlertResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailFor, setEmailFor] = useState<AlertResult["alerts"][0] | null>(null);
  const [history, setHistory] = useState<AlertHistory>();

  useEffect(() => {
    api.filters().then(setOpts).catch((e) => setError(e.message));
    loadHistory();
  }, []);

  function loadHistory() {
    api.alertHistory().then(setHistory).catch(() => setHistory(undefined));
  }

  async function ack(id: number) {
    await api.ackAlert(id).catch(() => {});
    loadHistory();
  }

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const r = await api.generateAlerts({ minRisk, minVibration: minVib, minTemp, requireOpenCorrective: requireCorrective, plants, machineTypes });
      setResult(r);
      notifyBrowser(r);
      loadHistory();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function notifyBrowser(r: AlertResult) {
    if (!("Notification" in window)) return;
    const fire = () =>
      new Notification("Volta Industrial · Alertas gerados", {
        body: `${r.summary.total} alertas (${r.summary.critical} críticos) · ${usd(r.summary.total_exposure_usd)} de exposição`,
        icon: "/favicon.svg",
      });
    if (Notification.permission === "granted") fire();
    else if (Notification.permission !== "denied") Notification.requestPermission().then((p) => p === "granted" && fire());
  }

  if (error && !opts) return <ErrorBox error={error} />;
  if (!opts) return <Loading />;

  return (
    <div className="two-col" style={{ alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Rules */}
        <Card title="Regras de disparo" hint="Read-only · calculado ao vivo sobre gold_line_status">
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="field">
              <label>Risco de falha mínimo — <b>{pct(minRisk)}</b></label>
              <input type="range" min={0} max={1} step={0.05} value={minRisk} onChange={(e) => setMinRisk(+e.target.value)} />
              <span className="faint" style={{ fontSize: 11 }}>≥ 0.75 crítico · ≥ 0.50 elevado · ≥ 0.25 atenção</span>
            </div>
            <div className="field">
              <label>Vibração mínima (RMS) — <b>{minVib.toFixed(1)}</b></label>
              <input type="range" min={0} max={10} step={0.5} value={minVib} onChange={(e) => setMinVib(+e.target.value)} />
            </div>
            <div className="field">
              <label>Temperatura mínima (°C) — <b>{minTemp}</b></label>
              <input type="range" min={0} max={120} step={5} value={minTemp} onChange={(e) => setMinTemp(+e.target.value)} />
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={requireCorrective} onChange={(e) => setRequireCorrective(e.target.checked)} />
              Somente linhas com corretivo aberto
            </label>

            <div className="field">
              <label>Plantas</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {opts.plants.map((p) => (
                  <button key={p} className="chip" onClick={() => toggle(plants, p, setPlants)}
                    style={plants.includes(p) ? active : {}}>{p}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Tipo de equipamento</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {opts.machineTypes.map((m) => (
                  <button key={m} className="chip" onClick={() => toggle(machineTypes, m, setMachineTypes)}
                    style={machineTypes.includes(m) ? active : {}}>{machineLabel(m)}</button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" onClick={run} disabled={loading} style={{ justifyContent: "center" }}>
              {loading ? <Spinner /> : <Play size={16} />} Gerar alertas
            </button>
          </div>
        </Card>
      </div>

      {/* Results */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <ErrorBox error={error} />}
        {result && (
          <>
            <div className="grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
              <Mini label="Alertas" value={num(result.summary.total)} />
              <Mini label="Críticos" value={num(result.summary.critical)} color="var(--critical)" />
              <Mini label="Elevados" value={num(result.summary.elevated)} color="var(--elevated)" />
              <Mini label="Exposição" value={usd(result.summary.total_exposure_usd, true)} color="var(--volta-primary)" />
            </div>

            <Card
              title="Alertas gerados"
              hint="Notificação de browser disparada automaticamente"
              actions={
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {result.persisted ? (
                    <span className="pill" style={{ background: "var(--healthy-soft)", color: "var(--healthy)", borderColor: "transparent" }}>
                      <Database size={12} /> persistido no Lakebase
                    </span>
                  ) : (
                    <span className="pill warn"><Database size={12} /> não persistido{result.persistError ? "" : ""}</span>
                  )}
                  <span className="pill"><Bell size={12} /> {result.alerts.length}</span>
                </div>
              }
            >
              <div className="table-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Alerta</th>
                      <th>Severidade</th>
                      <th className="num">Exposição</th>
                      <th>Motivo</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.alerts.map((a) => (
                      <tr key={a.line_id} style={{ cursor: "default" }}>
                        <td>
                          <div className="mono strong">{a.line_id}</div>
                          <div className="faint" style={{ fontSize: 11 }}>{machineLabel(a.machine_type)} · {a.plant_id}</div>
                        </td>
                        <td><RiskBadge band={a.severity} /></td>
                        <td className="num strong">{usd(a.downtime_exposure_usd)}</td>
                        <td className="muted" style={{ fontSize: 12, whiteSpace: "normal", maxWidth: 240 }}>{a.reason}</td>
                        <td>
                          <button className="icon-btn" title="Rascunho de email" onClick={() => setEmailFor(a)}>
                            <Mail size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
        {!result && !error && (
          <Card>
            <div className="card-pad muted" style={{ textAlign: "center", padding: 60 }}>
              <Bell size={30} color="var(--border-strong)" />
              <div style={{ marginTop: 12 }}>Defina as regras e clique em <b>Gerar alertas</b>.</div>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                Padrão: risco ≥ 75% (banda crítica). Cada disparo é persistido no Lakebase.
              </div>
            </div>
          </Card>
        )}

        {history?.configured && history.alerts.length > 0 && (
          <Card
            title="Histórico · Lakebase"
            hint="Alertas persistidos (mais recentes primeiro)"
            actions={<span className="pill"><Database size={12} /> {history.runs.length} disparo(s)</span>}
          >
            <div className="table-scroll" style={{ maxHeight: 340, overflowY: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Alerta</th>
                    <th>Severidade</th>
                    <th className="num">Exposição</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {history.alerts.map((a) => (
                    <tr key={a.id} style={{ cursor: "default", opacity: a.acknowledged ? 0.55 : 1 }}>
                      <td className="faint" style={{ fontSize: 11 }}>{new Date(a.generated_at).toLocaleString("pt-BR")}</td>
                      <td>
                        <div className="mono strong">{a.line_id}</div>
                        <div className="faint" style={{ fontSize: 11 }}>{machineLabel(a.machine_type)} · {a.plant_id}</div>
                      </td>
                      <td><RiskBadge band={a.severity} /></td>
                      <td className="num strong">{usd(a.downtime_exposure_usd)}</td>
                      <td>
                        {a.acknowledged ? (
                          <span className="pill" style={{ color: "var(--healthy)", background: "var(--healthy-soft)", borderColor: "transparent" }}>
                            <Check size={12} /> ok
                          </span>
                        ) : (
                          <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => ack(a.id)}>
                            Reconhecer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {emailFor && <EmailModal alert={emailFor} onClose={() => setEmailFor(null)} />}
    </div>
  );
}

const active = { borderColor: "var(--volta-primary)", color: "var(--volta-primary-dark)", background: "var(--volta-primary-tint)" };

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="kpi" style={{ padding: "12px 14px" }}>
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 22, color }}>{value}</div>
    </div>
  );
}

function EmailModal({ alert, onClose }: { alert: AlertResult["alerts"][0]; onClose: () => void }) {
  const subject = `[Volta] Alerta ${alert.severity.toUpperCase()} · ${alert.line_id} (${alert.plant_id})`;
  const body = `Prezado(a) responsável,

Um alerta de manutenção foi gerado para a linha ${alert.line_id} (${machineLabel(alert.machine_type)}) na ${alert.plant_id}.

• Severidade: ${alert.severity}
• Risco de falha: ${pct(alert.failure_risk_score)}
• Exposição a downtime: ${usd(alert.downtime_exposure_usd)}
• Motivo: ${alert.reason}
${alert.recommended_action ? `• Ação recomendada pelo modelo: ${alert.recommended_action}` : ""}

Recomenda-se avaliar a linha no app Volta — Downtime & Maintenance Rescue.

Atenciosamente,
Monitoramento Volta Industrial`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="drawer-overlay" onClick={onClose} style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: "min(560px,94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h3>Rascunho de notificação — {alert.line_id}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="card-pad">
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Assunto</label>
            <input className="input" readOnly value={subject} />
          </div>
          <div className="field">
            <label>Corpo</label>
            <textarea className="input" readOnly rows={12} value={body} style={{ resize: "vertical", fontSize: 12.5 }} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn" onClick={() => { navigator.clipboard.writeText(`${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              <Copy size={15} /> {copied ? "Copiado!" : "Copiar"}
            </button>
            <a className="btn btn-primary" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
              <Send size={15} /> Abrir no email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
