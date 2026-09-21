import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { getInvite, acceptInvite } from "../api";

export default function JoinGroup({ backendUser }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const { authenticated, login } = usePrivy();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getInvite(token).then(setInvite).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (authenticated && backendUser && invite && !joining) {
      setJoining(true);
      acceptInvite(token)
        .then((group) => navigate(`/groups/${group.id}`))
        .catch((e) => setError(e.message));
    }
  }, [authenticated, backendUser, invite]);

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>😕</div>
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <button className="btn btn-ghost" onClick={() => navigate("/")}>Go home</button>
      </div>
    );
  }

  if (!invite) return <p style={{ color: "var(--text-muted)" }}>Loading invite…</p>;

  return (
    <div style={{ textAlign: "center", padding: "48px 0" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
      <p style={{ fontSize: 15, color: "var(--text-muted)" }}>You're invited to join</p>
      <h2 style={{ fontSize: 28, margin: "6px 0 24px" }}>{invite.group_name}</h2>
      {authenticated ? (
        <p style={{ color: "var(--text-muted)" }}>Joining…</p>
      ) : (
        <>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>Log in with email to join — no seed phrase</p>
          <button className="btn btn-primary" onClick={login} style={{ padding: "14px 32px" }}>Log in & join</button>
        </>
      )}
    </div>
  );
}
