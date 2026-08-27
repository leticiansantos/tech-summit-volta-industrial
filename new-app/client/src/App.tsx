import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Activity, Bell, BellPlus, MessagesSquare, Wrench } from "lucide-react";
import Overview from "./pages/Overview";
import Alerts from "./pages/Alerts";
import AlertGeneration from "./pages/AlertGeneration";
import Recommendations from "./pages/Recommendations";
import Chat from "./pages/Chat";

const NAV = [
  { to: "/", label: "Visão Geral", icon: Activity, end: true },
  { to: "/alertas", label: "Central de Alertas", icon: Bell },
  { to: "/gerar-alertas", label: "Geração de Alertas", icon: BellPlus },
  { to: "/manutencao", label: "Recomendação & Plano", icon: Wrench },
  { to: "/chat", label: "Chat Genie", icon: MessagesSquare },
];

const TITLES: Record<string, { title: string; sub: string }> = {
  "/": { title: "Visão Geral", sub: "Exposição a downtime e saúde da frota — Volta Industrial" },
  "/alertas": { title: "Central de Alertas", sub: "Linhas em risco por severidade, mapa e triagem" },
  "/gerar-alertas": { title: "Geração de Alertas", sub: "Motor de regras sobre a telemetria e o risco de falha" },
  "/manutencao": { title: "Recomendação & Plano de Manutenção", sub: "Ação de maior valor líquido, com explicabilidade" },
  "/chat": { title: "Chat Genie · Volta Plant Floor", sub: "Pergunte em linguagem natural sobre o chão de fábrica" },
};

export default function App() {
  const { pathname } = useLocation();
  const meta = TITLES[pathname] || { title: "Volta Industrial", sub: "" };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Volta Industrial" className="brand-logo" />
          <div className="name">
            VOLTA
            <span>Industrial</span>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">Operações</div>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          Downtime & Maintenance Rescue
          <br />
          Powered by Databricks · Genie
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{meta.title}</h1>
            <div className="sub">{meta.sub}</div>
          </div>
          <div className="topbar-right">
            <span className="badge-live">
              <span className="dot" />
              serverless_sandbox_admin_catalog.default
            </span>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/alertas" element={<Alerts />} />
            <Route path="/gerar-alertas" element={<AlertGeneration />} />
            <Route path="/manutencao" element={<Recommendations />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
