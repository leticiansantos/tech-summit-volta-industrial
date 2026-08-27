import { useEffect, useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { api } from "../api";
import type { Line } from "../types";
import { Card, Loading, ErrorBox, RiskBadge } from "../components/ui";
import RiskScatter from "../components/RiskScatter";
import PlantMap from "../components/PlantMap";
import LineDrawer from "../components/LineDrawer";
import { usd, pct, machineLabel, actionLabel } from "../format";

const BANDS = ["critical", "elevated", "watch"] as const;

export default function Alerts() {
  const [lines, setLines] = useState<Line[]>();
  const [scatter, setScatter] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [band, setBand] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.atrisk(), api.scatter()])
      .then(([a, s]) => {
        setLines(a);
        setScatter(s);
      })
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!lines) return [];
    return lines.filter((l) => {
      if (band !== "all" && l.risk_band !== band) return false;
      if (q && !`${l.line_id} ${l.plant_id} ${l.machine_type}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [lines, band, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: lines?.length || 0 };
    for (const b of BANDS) c[b] = lines?.filter((l) => l.risk_band === b).length || 0;
    return c;
  }, [lines]);

  if (error) return <ErrorBox error={error} />;
  if (!lines) return <Loading text="Buscando linhas em risco…" />;

  return (
    <>
      <div className="two-col" style={{ marginBottom: 16 }}>
        <Card title="Mapa de risco" hint="Vibração × risco · tamanho = exposição">
          <div className="card-pad">
            <RiskScatter lines={scatter} onSelect={setSelected} />
          </div>
        </Card>
        <Card title="Plantas" hint="Exposição agregada por unidade" actions={<MapPin size={16} color="var(--text-muted)" />}>
          <div className="card-pad">
            <PlantMap lines={scatter} />
          </div>
        </Card>
      </div>

      <Card
        title={`Fila de alertas · ${filtered.length}`}
        hint="Clique em uma linha para investigar e gerar o plano"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "var(--text-faint)" }} />
              <input
                className="input" placeholder="Buscar linha / planta…" value={q}
                onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30, width: 210, height: 34 }}
              />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["all", ...BANDS] as const).map((b) => (
                <button
                  key={b}
                  className={`chip${band === b ? " " : ""}`}
                  style={band === b ? { borderColor: "var(--volta-primary)", color: "var(--volta-primary-dark)", background: "var(--volta-primary-tint)" } : {}}
                  onClick={() => setBand(b)}
                >
                  {b === "all" ? "Todos" : b === "critical" ? "Crítico" : b === "elevated" ? "Elevado" : "Atenção"} ({counts[b]})
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="table-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Linha</th>
                <th>Planta</th>
                <th>Equipamento</th>
                <th>Severidade</th>
                <th className="num">Risco</th>
                <th className="num">Vibração</th>
                <th className="num">Exposição</th>
                <th>Peça</th>
                <th>Ação recomendada</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.line_id} onClick={() => setSelected(l.line_id)}>
                  <td className="mono strong">{l.line_id}</td>
                  <td>{l.plant_id}</td>
                  <td>{machineLabel(l.machine_type)}</td>
                  <td><RiskBadge band={l.risk_band} /></td>
                  <td className="num strong">{pct(l.failure_risk_score)}</td>
                  <td className="num">{l.vibration_rms?.toFixed(2)}</td>
                  <td className="num strong">{usd(l.downtime_exposure_usd)}</td>
                  <td>
                    {l.part_local ? (
                      <span className="pill">local</span>
                    ) : (
                      <span className="pill warn">expedir</span>
                    )}
                  </td>
                  <td>{l.recommended_action ? <span className="pill action">{actionLabel(l.recommended_action)}</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && <LineDrawer lineId={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
