import { useEffect, useRef, useState } from "react";
import { Database, Send, Sparkles } from "lucide-react";
import { api } from "../api";
import type { GeniePart } from "../types";

interface Msg {
  role: "user" | "bot";
  text?: string;
  parts?: GeniePart[];
  pending?: boolean;
}

const STARTERS = [
  "Quais linhas têm maior exposição a downtime?",
  "Por que a LINE-0004 está indo para uma parada?",
  "Quantas linhas críticas há na PLANT-03?",
  "Qual a ação recomendada para as linhas com peça não local?",
];

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [conv, setConv] = useState<string>();
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: question }, { role: "bot", pending: true }]);
    try {
      const r = await api.genie(question, conv);
      setConv(r.conversationId);
      setMsgs((m) => [...m.slice(0, -1), { role: "bot", parts: r.parts }]);
    } catch (e: any) {
      setMsgs((m) => [...m.slice(0, -1), { role: "bot", text: `Erro: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-wrap">
      <div className="chat-scroll" ref={scrollRef}>
        {msgs.length === 0 && (
          <div style={{ textAlign: "center", margin: "auto", maxWidth: 520 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--volta-primary)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
              <Sparkles size={26} color="#fff" />
            </div>
            <h2 style={{ margin: "0 0 6px" }}>Volta Plant Floor</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              Pergunte em linguagem natural sobre linhas, risco, exposição e manutenção. As respostas
              vêm da Genie, consultando o lakehouse governado.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 18 }}>
              {STARTERS.map((s) => (
                <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="avatar">{m.role === "user" ? "SO" : <Sparkles size={15} />}</div>
            <div className="bubble">
              {m.pending && <span className="muted"><span className="spinner" /> consultando a Genie…</span>}
              {m.text && <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>}
              {m.parts?.map((p, j) => <PartView key={j} part={p} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          className="input" placeholder="Pergunte à Genie…" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(input)} disabled={busy}
        />
        <button className="btn btn-primary" onClick={() => ask(input)} disabled={busy || !input.trim()}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function PartView({ part }: { part: GeniePart }) {
  if (part.type === "text") return <div style={{ whiteSpace: "pre-wrap" }}>{part.content}</div>;

  const rows = part.result?.rows ?? [];
  const cols = part.result?.columns ?? [];
  const shown = rows.slice(0, 12);
  return (
    <div>
      {part.description && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{part.description}</div>}
      {part.sql && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Database size={13} /> ver SQL gerado
          </summary>
          <div className="sql-block">{part.sql}</div>
        </details>
      )}
      {cols.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
          <table className="tbl">
            <thead>
              <tr>{cols.map((c) => <th key={c.name}>{c.name}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i} style={{ cursor: "default" }}>
                  {cols.map((c) => <td key={c.name}>{String(r[c.name] ?? "—")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown.length && <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>+{rows.length - shown.length} linhas…</div>}
    </div>
  );
}
