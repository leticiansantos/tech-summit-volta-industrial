import type {
  Kpis, Line, PlantRollup, LineDetail, Recommendation, AlertResult, GenieResponse, AlertHistory,
} from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
  return res.json();
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
  return res.json();
}

export const api = {
  kpis: () => get<{ kpis: Kpis }>("/api/kpis").then((d) => d.kpis),
  plants: () => get<{ plants: PlantRollup[] }>("/api/plants").then((d) => d.plants),
  atrisk: () => get<{ lines: Line[] }>("/api/atrisk").then((d) => d.lines),
  scatter: () => get<{ lines: Line[] }>("/api/scatter").then((d) => d.lines),
  recommendations: () => get<{ recommendations: Line[] }>("/api/recommendations").then((d) => d.recommendations),
  filters: () => get<{ plants: string[]; machineTypes: string[] }>("/api/filters"),
  line: (id: string) => get<LineDetail>(`/api/line/${id}`),
  recommendation: (id: string) =>
    get<{ recommendation: Recommendation }>(`/api/recommendation/${id}`).then((d) => d.recommendation),
  plan: (id: string) =>
    post<{ plan: string; recommendation: Recommendation }>(`/api/plan/${id}`, {}),
  generateAlerts: (rules: unknown) => post<AlertResult>("/api/alerts/generate", rules),
  alertHistory: () => get<AlertHistory>("/api/alerts/history"),
  ackAlert: (id: number) => post<{ ok: boolean }>(`/api/alerts/${id}/ack`, {}),
  genie: (content: string, conversationId?: string) =>
    post<GenieResponse>("/api/genie/message", { content, conversationId }),
};
