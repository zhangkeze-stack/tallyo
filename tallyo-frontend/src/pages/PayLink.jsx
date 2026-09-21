import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { getPaymentLink, markPaid } from "../api";
import { sendMusd } from "../settle";

export default function PayLink() {
  const { token } = useParams();
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    getPaymentLink(token)
      .then((d) => { setInfo(d); if (d.amount) setAmount(String(d.amount)); })
      .catch((e) => setError(e.message));
  }, [token]);

  async function handlePay() {
    setError(""); setMsg(""); setPaying(true);
    try {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter an amount");
      if (!info.payee_wallet) throw new Error("Recipient has no wallet address");
      const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
      if (!wallet) throw new Error("Wallet not found");
      setMsg("Sending on-chain, please wait…");
      const txHash = await sendMusd(wallet, info.payee_wallet, amt);
      setMsg("Transfer sent, confirming…");
      await markPaid(token, txHash);
      setMsg(`✅ Paid! Tx: ${txHash}`);
      setDone(true);
    } catch (e) {
      const m = e?.message || String(e);
      if (m.includes("rejected") || m.includes("denied")) { setMsg(""); }
      else { setError("Payment failed: " + m); }
    } finally {
      setPaying(false);
    }
  }

  if (error && !info) {
    return <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
      <p style={{ color: "var(--danger)" }}>{error}</p>
    </div>;
  }
  if (!info) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <div style={{ textAlign: "center", padding: "40px 0" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💸</div>
      <p style={{ fontSize: 15, color: "var(--text-muted)" }}>Pay</p>
      <h2 style={{ fontSize: 26, margin: "4px 0 4px" }}>{info.payee_name}</h2>
      {info.note && <p style={{ color: "var(--text-muted)", fontSize: 14 }}>“{info.note}”</p>}

      <div className="tabular" style={{ fontSize: 44, fontWeight: 700, color: "var(--primary)", margin: "20px 0 4px" }}>
        ${amount || "0"}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>🇺🇸 → 🇸🇬 stablecoins arrive in seconds · near-zero fees</p>

      {done ? (
        <div className="card" style={{ background: "#F0FDF9", borderColor: "var(--success)", color: "#065F46", fontSize: 14, wordBreak: "break-all" }}>{msg}</div>
      ) : !authenticated ? (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 16 }}>Log in with email to pay — no seed phrase</p>
          <button className="btn btn-primary" onClick={login} style={{ padding: "14px 32px" }}>Log in & pay</button>
        </>
      ) : (
        <>
          {!info.amount && (
            <input className="input tabular" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" style={{ maxWidth: 200, margin: "0 auto 16px", textAlign: "center" }} />
          )}
          {msg && <p style={{ color: "var(--primary)", fontSize: 14, wordBreak: "break-all" }}>{msg}</p>}
          {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}
          <button className="btn btn-success" onClick={handlePay} disabled={paying || wallets.length === 0} style={{ padding: "14px 40px" }}>
            {wallets.length === 0 ? "Loading wallet" : paying ? "Paying…" : `Pay $${amount || "0"}`}
          </button>
        </>
      )}
    </div>
  );
}
