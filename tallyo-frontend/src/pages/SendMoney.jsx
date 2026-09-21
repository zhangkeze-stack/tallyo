import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallets } from "@privy-io/react-auth";
import { getUserByEmail, getRecentPayees, recordDirectTransfer } from "../api";
import { sendMusd } from "../settle";

export default function SendMoney({ backendUser }) {
  const navigate = useNavigate();
  const { wallets } = useWallets();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getRecentPayees().then(setRecent).catch(() => {});
  }, []);

  async function handleSend() {
    setError(""); setMsg(""); setSending(true);
    try {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter an amount");
      const payee = await getUserByEmail(email.trim());
      if (payee.id === backendUser.id) throw new Error("You can't send to yourself");
      const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
      if (!wallet) throw new Error("Wallet not found");
      setMsg("Sending on-chain, please wait…");
      const txHash = await sendMusd(wallet, payee.wallet_address, amt);
      setMsg("Transfer sent, confirming…");
      await recordDirectTransfer(payee.id, amt, txHash, note || null);
      setMsg(`✅ Sent $${amt} to ${payee.email.split("@")[0]}! Tx: ${txHash}`);
      setDone(true);
    } catch (e) {
      const m = e?.message || String(e);
      if (m.includes("rejected") || m.includes("denied")) { setMsg(""); }
      else { setError(m); }
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ marginBottom: 12, paddingLeft: 0 }}>‹ Back</button>
      <h2 style={{ fontSize: 24, marginBottom: 20 }}>Send</h2>

      {done ? (
        <div className="card" style={{ background: "#F0FDF9", borderColor: "var(--success)", color: "#065F46", wordBreak: "break-all" }}>
          {msg}
          <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ display: "block", marginTop: 12 }}>Done</button>
        </div>
      ) : (
        <>
          {recent.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Recent</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recent.map((p) => (
                  <button key={p.id} onClick={() => setEmail(p.email)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: email === p.email ? "var(--primary)" : "var(--surface)", color: email === p.email ? "#fff" : "var(--text)", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 12px 5px 6px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--primary)", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.email[0].toUpperCase()}
                    </span>
                    {p.email.split("@")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Recipient email</div>
              <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email (must be on Tallyo)" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Amount</div>
              <input className="input tabular" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Note (optional)</div>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Movie tickets" />
            </div>
            {msg && <p style={{ color: "var(--primary)", fontSize: 14, wordBreak: "break-all", margin: 0 }}>{msg}</p>}
            {error && <p style={{ color: "var(--danger)", fontSize: 14, margin: 0 }}>{error}</p>}
            <button className="btn btn-success" onClick={handleSend} disabled={sending || wallets.length === 0} style={{ padding: 14 }}>
              {wallets.length === 0 ? "Loading wallet" : sending ? "Sending…" : "Send"}
            </button>
            <p style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", margin: 0 }}>🇸🇬 → 🇺🇸 stablecoins arrive in seconds · near-zero fees</p>
          </div>
        </>
      )}
    </div>
  );
}
