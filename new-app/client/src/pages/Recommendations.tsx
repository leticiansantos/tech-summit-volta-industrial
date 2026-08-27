import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Sparkles } from "lucide-react";
import { api } from "../api";
import type { Line, RankedAction, Recommendation } from "../types";
import { Card, Loading, ErrorBox, RiskBadge, Spinner } from "../components/ui";
import { usd, pct, machineLabel, actionLabel } from "../format";

export default function Recommendations() {
  const location = useLocation() as { state?: { lineId?: string } };
  const [recs, setRecs] = useState<Line[]>();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(location.state?.lineId ?? null);

  useEffect(() => {
    api.recommendations().then((r) => {
      setRecs(r);
      if (!location.state?.lineId && r.length) setSelected(r[0].line_id);
    }).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!recs) return <Loading text="Carregando recomendações do modelo…" />;

  const selectedRec = recs.find((r) => r.line_id === selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title={`Recomendações · ${recs.length}`} hint="Ranqueadas por valor líquido previsto · clique para selecionar">
        <div className="table-scroll" style={{ maxHeight: 300, overflowY: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Linha</th>
                <th>Ação recomendada</th>
                <th className="num">Valor líquido</th>
                <th className="num">Evitado</th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => (
                <tr
                  key={r.line_id}
                  onClick={() => setSelected(r.line_id)}
                  style={selected === r.line_id ? { background: "var(--volta-primary-tint)" } : {}}
                >
                  <td>
                    <div className="mono strong">{r.line_id}</div>
                    <div className="faint" style={{ fontSize: 11 }}>{r.plant_id} · {machineLabel(r.machine_type)}</div>
                  </td>
                  <td><span className="pill action">{actionLabel(r.recommended_action)}</span></td>
                  <td className="num strong" style={{ color: (r.predicted_net_value_usd ?? 0) >= 0 ? "var(--healthy)" : "var(--critical)" }}>
                    {usd(r.predicted_net_value_usd)}
                  </td>
                  <td className="num">{usd(r.predicted_downtime_cost_avoided_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedRec ? <PlanPanel key={selectedRec.line_id} rec={selectedRec} /> : null}
    </div>
  );
}

function PlanPanel({ rec }: { rec: Line }) {
  const [plan, setPlan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modelRec, setModelRec] = useState<Recommendation>();

  const ranking: RankedAction[] = useMemo(() => {
    try {
      return rec.action_ranking ? JSON.parse(rec.action_ranking) : [];
    } catch {
      return [];
    }
  }, [rec]);
  const maxNet = Math.max(1, ...ranking.map((r) => Math.abs(r.net_value)));

  async function generate() {
    setLoading(true);
    setError("");
    setPlan("");
    try {
      const r = await api.plan(rec.line_id);
      setPlan(r.plan);
      setModelRec(r.recommendation);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card
        title={`${rec.line_id} · ${machineLabel(rec.machine_type)}`}
        hint={`${rec.plant_id} · criticidade ${rec.criticality}`}
        actions={<RiskBadge band={rec.risk_band} />}
      >
        <div className="card-pad">
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <div className="cell"><div className="k">Risco de falha</div><div className="v">{pct(rec.failure_risk_score)}</div></div>
            <div className="cell"><div className="k">Exposição</div><div className="v">{usd(rec.downtime_exposure_usd)}</div></div>
            <div className="cell"><div className="k">Peça</div><div className="v" style={{ fontSize: 14 }}>{rec.part_local ? "Local" : `Expedir · ${rec.part_lead_time_days ?? "?"}d`}</div></div>
            <div className="cell"><div className="k">Valor líquido</div><div className="v" style={{ color: "var(--healthy)" }}>{usd(rec.predicted_net_value_usd)}</div></div>
          </div>

          <div className="section-title">Ações avaliadas pelo modelo</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ranking.slice().sort((a, b) => b.net_value - a.net_value).map((r, i) => (
              <div key={r.action} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 190, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  {i === 0 && <span className="pill action" style={{ padding: "1px 7px" }}>✓</span>}
                  {actionLabel(r.action)}
                </div>
                <div style={{ flex: 1, height: 22, background: "var(--surface-2)", borderRadius: 5, position: "relative", overflow: "hidden" }}>
                  <div style={{ width: `${(Math.abs(r.net_value) / maxNet) * 100}%`, height: "100%", background: r.net_value >= 0 ? "var(--healthy)" : "var(--critical)", opacity: 0.85 }} />
                  <span style={{ position: "absolute", right: 8, top: 3, fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{usd(r.net_value)}</span>
                </div>
              </div>
            ))}
          </div>

          <button className="btn btn-primary" onClick={generate} disabled={loading} style={{ marginTop: 18, width: "100%", justifyContent: "center" }}>
            {loading ? <Spinner /> : <Sparkles size={16} />} {plan ? "Regenerar plano" : "Gerar plano de manutenção"}
          </button>
          <div className="faint" style={{ fontSize: 11, marginTop: 6, textAlign: "center" }}>
            Redigido pelo endpoint {modelRec ? "· fonte: " + (modelRec.source) : "databricks-claude-sonnet-4-5"}
          </div>
        </div>
      </Card>

      {error && <ErrorBox error={error} />}
      {loading && !plan && (
        <Card><div className="center-load"><Spinner /> O assistente está redigindo o plano e a explicabilidade…</div></Card>
      )}
      {plan && (
        <Card title="Plano de manutenção" actions={<FileText size={16} color="var(--text-muted)" />}>
          <div className="card-pad markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{plan}</Markdown>
          </div>
        </Card>
      )}
    </div>
  );
}
