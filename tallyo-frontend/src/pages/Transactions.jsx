import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyTransactions } from "../api";
import { usePolling } from "../usePolling";

const EXPLORER = "https://testnet.monadscan.com/tx/";

export default function Transactions() {
  const navigate = useNavigate();
  const [txns, setTxns] = useState(null);
  const [error, setError] = useState("");

  const load = () => getMyTransactions().then(setTxns).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  usePolling(load, 2000);

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ marginBottom: 12, paddingLeft: 0 }}>‹ Back</button>
      <h2 style={{ fontSize: 24, marginBottom: 20 }}>Activity</h2>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!txns ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : txns.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>No activity yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {txns.map((t) => {
            const out = t.direction === "out";
            return (
              <div key={t.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {out ? `To ${t.counterparty}` : `From ${t.counterparty}`}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>
                    {t.note}
                    {t.created_at && <> · {new Date(t.created_at).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>}
                  </div>
                  {t.tx_hash && (
                    <a href={`${EXPLORER}${t.tx_hash}`} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: "var(--primary)", textDecoration: "none" }}>
                      View on-chain ↗
                    </a>
                  )}
                </div>
                <div className="tabular" style={{ fontSize: 18, fontWeight: 700, color: out ? "var(--danger)" : "var(--success)" }}>
                  {out ? "−" : "+"}${t.amount}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
