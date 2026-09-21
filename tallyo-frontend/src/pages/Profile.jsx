import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

export default function Profile({ backendUser }) {
  const navigate = useNavigate();
  const { user, logout } = usePrivy();
  const addr = user?.wallet?.address || "";

  const emailAddr = user?.email?.address || "";

  function copyAddr() {
    if (addr) navigator.clipboard.writeText(addr);
  }
  function copyEmail() {
    if (emailAddr) navigator.clipboard.writeText(emailAddr);
  }

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ marginBottom: 12, paddingLeft: 0 }}>‹ Back</button>
      <h2 style={{ fontSize: 24, marginBottom: 20 }}>Account</h2>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <span style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--primary)", color: "#fff", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {(user?.email?.address?.[0] || "?").toUpperCase()}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Email</div>
          <div style={{ fontSize: 15, fontWeight: 600, wordBreak: "break-all" }}>{user?.email?.address || "—"}</div>
        </div>
        <button className="btn btn-primary" style={{ whiteSpace: "nowrap", padding: "8px 14px" }} onClick={copyEmail}>Copy</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Your wallet address</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ fontSize: 12, wordBreak: "break-all", flex: 1, background: "var(--bg)", padding: "8px 10px", borderRadius: 8 }}>{addr || "—"}</code>
          <button className="btn btn-primary" style={{ whiteSpace: "nowrap", padding: "8px 14px" }} onClick={copyAddr}>Copy</button>
        </div>
      </div>

      <button className="btn" onClick={logout} style={{ width: "100%", padding: 12, background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)" }}>
        Log out
      </button>
    </div>
  );
}
