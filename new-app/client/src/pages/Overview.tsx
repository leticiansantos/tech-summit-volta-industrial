import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertOctagon, DollarSign, PackageX, TrendingUp, Wrench, Zap } from "lucide-react";
import { api } from "../api";
import type { Kpis, Line, PlantRollup } from "../types";
import { KpiCard, Card, Loading, ErrorBox } from "../components/ui";
import RiskScatter from "../components/RiskScatter";
import PlantExposure from "../components/PlantExposure";
import { usd, num } from "../format";

export default function Overview() {
  const nav = useNavigate();
  const [kpis, setKpis] = useState<Kpis>();
  const [plants, setPlants] = useState<PlantRollup[]>([]);
  const [scatter, setScatter] = useState<Line[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.kpis(), api.plants(), api.scatter()])
      .then(([k, p, s]) => {
        setKpis(k);
        setPlants(p);
        setScatter(s);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!kpis) return <Loading text="Consultando o lakehouse…" />;

  return (
    <>
      <div className="banner">
        <Zap size={22} color="var(--volta-primary)" style={{ marginTop: 2 }} />
        <div>
          <div className="b-title">Um pico de utilização há ~3 semanas empurrou {num(kpis.critical_lines)} linhas para risco crítico</div>
          <div className="b-text">
            {num(kpis.atrisk_lines)} linhas em risco acumulam {usd(kpis.total_exposure_usd)} de exposição a downtime
            (US$ 22 mil/hora parada). {num(kpis.nonlocal_part_lines)} delas dependem de peça não estocada localmente.
            O modelo de manutenção projeta {usd(kpis.predicted_net_value_usd)} de valor líquido se agirmos agora.
          </div>
        </div>
      </div>

      <div className="grid kpi-row" style={{ marginBottom: 16 }}>
        <KpiCard
          label="Exposição a downtime" accent="critical" icon={<DollarSign size={14} />}
          value={usd(kpis.total_exposure_usd, true)} foot="linhas em risco (crítico + elevado + atenção)"
        />
        <KpiCard
          label="Linhas críticas" accent="critical" icon={<AlertOctagon size={14} />}
          value={num(kpis.critical_lines)} foot={`de ${num(kpis.total_lines)} linhas monitoradas`}
        />
        <KpiCard
          label="Corretivos abertos" accent="watch" icon={<Wrench size={14} />}
          value={num(kpis.open_work_orders)} foot="ordens de manutenção pendentes"
        />
        <KpiCard
          label="Peça não local" accent="watch" icon={<PackageX size={14} />}
          value={num(kpis.nonlocal_part_lines)} foot="linhas dependem de peça com lead time"
        />
        <KpiCard
          label="Valor líquido previsto" accent="healthy" icon={<TrendingUp size={14} />}
          value={usd(kpis.predicted_net_value_usd, true)} foot={`${usd(kpis.predicted_cost_avoided_usd, true)} de downtime evitável`}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card title="Mapa de risco da frota" hint="Vibração × risco de falha · tamanho = exposição · clique para detalhar">
          <div className="card-pad">
            <RiskScatter lines={scatter} onSelect={() => nav("/alertas")} />
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
              <Legend color="#e5484d" label="Crítico" />
              <Legend color="#f2711c" label="Elevado" />
              <Legend color="#f5a623" label="Atenção" />
              <Legend color="#2f9e8f" label="Saudável (amostra)" />
            </div>
          </div>
        </Card>

        <Card title="Exposição por planta" hint="Ranqueada por $ · realce nas plantas com mais linhas críticas">
          <div className="card-pad">
            <PlantExposure plants={plants} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color }} /> {label}
    </span>
  );
}
