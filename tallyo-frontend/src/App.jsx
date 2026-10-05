import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { syncUser, fundMe } from "./api";
import GroupList from "./pages/GroupList";
import GroupDetail from "./pages/GroupDetail";
import JoinGroup from "./pages/JoinGroup";
import PayLink from "./pages/PayLink";
import SendMoney from "./pages/SendMoney";
import Transactions from "./pages/Transactions";
import Profile from "./pages/Profile";

function LoginScreen({ login }) {
  return (
    <div className="container" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ marginBottom: "auto", paddingTop: 48 }} />
      <div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--primary)" }}>Tallyo</div>
        <p style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.4, marginTop: 12, marginBottom: 8 }}>
          Split bills with friends abroad. Settle in seconds.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 15, lineHeight: 1.6, marginTop: 0 }}>
          Track shared expenses, net out who owes what, and settle up in one tap — stablecoins arrive across borders in seconds, no 3-day wait, no hefty fees. No seed phrase, ever.
        </p>
        <button className="btn btn-primary" onClick={login} style={{ width: "100%", marginTop: 24, padding: "14px" }}>
          Get started with email
        </button>
      </div>
      <div style={{ marginTop: "auto", paddingBottom: 24, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
        🇸🇬 ↔ 🇺🇸　Settled with stablecoins on Monad
      </div>
    </div>
  );
}

function NavHeaderButton() {
  const nav = useNavigate();
  return (
    <button className="btn btn-ghost" onClick={() => nav("/profile")} style={{ fontSize: 13 }}>Account</button>
  );
}

function App() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const [backendUser, setBackendUser] = useState(null);

  useEffect(() => {
    if (authenticated && user?.email?.address && user?.wallet?.address) {
      syncUser(user.email.address, user.wallet.address, user.id)
        .then((u) => {
          setBackendUser(u);
          fundMe().catch(() => {});   // testnet: top up an empty wallet (never blocks login)
        })
        .catch(console.error);
    }
  }, [authenticated, user?.email?.address, user?.wallet?.address]);

  if (!ready) {
    return <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Loading…</div>;
  }

  return (
    <BrowserRouter>
      <div className="container">
        {authenticated && (
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--primary)", letterSpacing: "-0.02em" }}>Tallyo</span>
            <NavHeaderButton />
          </header>
        )}
        <Routes>
          <Route path="/join/:token" element={<JoinGroup backendUser={backendUser} />} />
          <Route path="/pay/:token" element={<PayLink />} />
          <Route path="/profile" element={
            !authenticated ? <LoginScreen login={login} />
            : !backendUser ? <p style={{ color: "var(--text-muted)" }}>Syncing account…</p>
            : <Profile backendUser={backendUser} />
          } />
          <Route path="/transactions" element={
            !authenticated ? <LoginScreen login={login} />
            : !backendUser ? <p style={{ color: "var(--text-muted)" }}>Syncing account…</p>
            : <Transactions />
          } />
          <Route path="/send" element={
            !authenticated ? <LoginScreen login={login} />
            : !backendUser ? <p style={{ color: "var(--text-muted)" }}>Syncing account…</p>
            : <SendMoney backendUser={backendUser} />
          } />
          <Route path="/" element={
            !authenticated ? <LoginScreen login={login} />
            : !backendUser ? <p style={{ color: "var(--text-muted)" }}>Syncing account…</p>
            : <GroupList backendUser={backendUser} />
          } />
          <Route path="/groups/:groupId" element={
            !authenticated ? <LoginScreen login={login} />
            : !backendUser ? <p style={{ color: "var(--text-muted)" }}>Syncing account…</p>
            : <GroupDetail backendUser={backendUser} />
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
