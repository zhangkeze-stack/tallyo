import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { getMyGroups, createGroup, createPaymentLink } from "../api";
import { getMusdBalance } from "../settle";
import { usePolling } from "../usePolling";

export default function GroupList({ backendUser }) {
  const { user } = usePrivy();
  const [groups, setGroups] = useState([]);
  const [balance, setBalance] = useState(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payLink, setPayLink] = useState("");
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  function loadGroups() {
    if (!backendUser) return;
    getMyGroups(backendUser.id).then(setGroups).catch((e) => setError(e.message));
  }
  function loadBalance() {
    const addr = user?.wallet?.address;
    if (!addr) return;
    getMusdBalance(addr).then(setBalance).catch(() => setBalance("—"));
  }
  useEffect(() => { loadGroups(); loadBalance(); }, [backendUser]);
  usePolling(() => { loadGroups(); loadBalance(); }, 2000);

  async function handleCreate() {
    if (!newName.trim()) return;
    setError("");
    try {
      await createGroup(newName, backendUser.id, [backendUser.id]);
      setNewName("");
      loadGroups();
    } catch (e) { setError(e.message); }
  }

  async function handleCreatePayLink() {
    setError("");
    try {
      const { token } = await createPaymentLink(payAmount ? Number(payAmount) : null, payNote || null);
      setPayLink(`${window.location.origin}/pay/${token}`);
      setCopied(false);
    } catch (e) { setError(e.message); }
  }

  async function copyPayLink() {
    try { await navigator.clipboard.writeText(payLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  return (
    <div>
      {/* Balance card */}
      <div onClick={() => navigate("/transactions")} style={{ background: "var(--primary)", borderRadius: "var(--radius)", padding: "20px 22px", marginBottom: 24, color: "#fff", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Your balance</div>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Activity ›</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
          <span className="tabular" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {balance === null ? "…" : balance}
          </span>
          <span style={{ fontSize: 15, opacity: 0.85 }}>mUSD</span>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>≈ USD · sends across borders in seconds</div>
      </div>

      {/* Send / Request */}
      {!showPay && (
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <button className="btn btn-primary" onClick={() => navigate("/send")} style={{ flex: 1, padding: 12 }}>
            ↗ Send
          </button>
          <button className="btn" onClick={() => setShowPay(true)} style={{ flex: 1, padding: 12, background: "var(--surface)", border: "1px solid var(--primary)", color: "var(--primary)" }}>
            💸 Request link
          </button>
        </div>
      )}

      {/* Request link panel */}
      <div style={{ marginBottom: showPay ? 24 : 0 }}>
        {showPay && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <strong style={{ fontSize: 15 }}>Request link</strong>
              <button onClick={() => { setShowPay(false); setPayLink(""); }} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "var(--text-muted)" }}>×</button>
            </div>
            {!payLink ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="input tabular" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount (leave blank to let them enter)" />
                <input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Note (optional), e.g. Dinner split" />
                <button className="btn btn-primary" onClick={handleCreatePayLink}>Create link</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Send this link — they can pay you in one tap</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" readOnly value={payLink} style={{ fontSize: 12 }} onFocus={(e) => e.target.select()} />
                  <button className="btn btn-primary" onClick={copyPayLink} style={{ whiteSpace: "nowrap" }}>{copied ? "Copied ✓" : "Copy"}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 22, marginBottom: 16 }}>Your groups</h2>

      <div className="card" style={{ marginBottom: 20, display: "flex", gap: 8 }}>
        <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group, e.g. Tokyo trip" />
        <button className="btn btn-primary" onClick={handleCreate} style={{ whiteSpace: "nowrap" }}>Create</button>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {groups.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
          No groups yet. Create one to start splitting.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {groups.map((g) => (
            <div key={g.id} className="card" onClick={() => navigate(`/groups/${g.id}`)}
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>{g.member_ids.length} members</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {g.i_owe > 0 && (
                  <span style={{ background: "#FFF1ED", color: "var(--danger)", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999 }}>
                    You owe ${g.i_owe}
                  </span>
                )}
                {g.owed_to_me > 0 && (
                  <span style={{ background: "#ECFDF5", color: "var(--success)", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999 }}>
                    Owed ${g.owed_to_me}
                  </span>
                )}
                <span style={{ color: "var(--text-muted)", fontSize: 20 }}>›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
