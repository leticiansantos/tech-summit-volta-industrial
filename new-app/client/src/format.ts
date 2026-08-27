export const usd = (n?: number | null, compact = false): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(n);
};

export const num = (n?: number | null): string =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(n);

export const pct = (n?: number | null): string =>
  n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`;

export const machineLabel = (m: string): string => (m || "").replace(/_/g, " ");

export const ACTION_LABELS: Record<string, string> = {
  pull_now: "Parar agora",
  run_to_shift_end: "Rodar até o fim do turno",
  expedite_parts_and_run: "Agilizar peça e rodar",
};
export const actionLabel = (a?: string): string => (a ? ACTION_LABELS[a] || a : "—");

export const bandLabel: Record<string, string> = {
  critical: "Crítico",
  elevated: "Elevado",
  watch: "Atenção",
  healthy: "Saudável",
};
