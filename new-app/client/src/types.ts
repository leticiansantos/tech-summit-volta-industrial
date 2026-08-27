export type RiskBand = "critical" | "elevated" | "watch" | "healthy";

export interface Line {
  line_id: string;
  plant_id: string;
  line_name: string;
  machine_type: string;
  criticality: string;
  plant_lat: number;
  plant_lng: number;
  vibration_rms: number;
  temperature_c: number;
  utilization_pct: number;
  failure_risk_score: number;
  open_wo_count: number;
  has_open_corrective: boolean;
  part_local: boolean;
  downtime_exposure_usd: number;
  risk_band: RiskBand;
  candidate_part_id?: string;
  part_lead_time_days?: number;
  part_unit_cost_usd?: number;
  recommended_action?: string;
  predicted_net_value_usd?: number;
  predicted_downtime_cost_avoided_usd?: number;
  action_ranking?: string;
}

export interface Kpis {
  atrisk_lines: number;
  critical_lines: number;
  elevated_lines: number;
  watch_lines: number;
  total_lines: number;
  total_exposure_usd: number;
  open_work_orders: number;
  nonlocal_part_lines: number;
  predicted_net_value_usd: number;
  predicted_cost_avoided_usd: number;
}

export interface PlantRollup {
  plant_id: string;
  exposure: number;
  atrisk: number;
  critical: number;
  lines: number;
  avg_risk: number;
  avg_vib: number;
}

export interface TelemetryPoint {
  telemetry_date: string;
  vibration_rms: number;
  temperature_c: number;
  utilization_pct: number;
  error_count: number;
}

export interface LineDetail {
  line: Line | null;
  telemetry: TelemetryPoint[];
  note: { snapshot_date: string; failure_risk_score: number; open_wo_count: number; technician_note_text: string } | null;
}

export interface RankedAction {
  action: string;
  net_value: number;
  cost: number;
  avoided: number;
}

export interface Recommendation {
  line_id: string;
  recommended_action: string;
  predicted_net_value_usd: number;
  predicted_downtime_cost_avoided_usd: number;
  ranking: RankedAction[];
  source: string;
}

export interface Alert extends Line {
  severity: RiskBand;
  title: string;
  reason: string;
  generated_at: string;
}

export interface AlertResult {
  summary: { total: number; critical: number; elevated: number; watch: number; total_exposure_usd: number };
  alerts: Alert[];
  runId?: string;
  persisted?: boolean;
  persistError?: string | null;
}

export interface PersistedAlert {
  id: number;
  run_id: string;
  generated_at: string;
  generated_by: string;
  line_id: string;
  plant_id: string;
  machine_type: string;
  severity: string;
  failure_risk_score: number;
  downtime_exposure_usd: number;
  part_local: boolean;
  recommended_action: string | null;
  reason: string;
  acknowledged: boolean;
}

export interface AlertRun {
  run_id: string;
  generated_at: string;
  generated_by: string;
  total: number;
  critical: number;
  total_exposure_usd: number;
  acknowledged: number;
}

export interface AlertHistory {
  configured: boolean;
  runs: AlertRun[];
  alerts: PersistedAlert[];
}

export interface GeniePart {
  type: "text" | "query";
  content?: string;
  sql?: string;
  description?: string | null;
  result?: { columns: { name: string; type: string }[]; rows: Record<string, unknown>[] } | null;
}

export interface GenieResponse {
  conversationId: string;
  messageId: string;
  status: string;
  parts: GeniePart[];
}
