import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWallets } from "@privy-io/react-auth";
import { getGroup, getBalances, getExpenses, createExpense, addMember, getUserWallet, createSettlement, getGroupMembers, createInvite, createExpenseExact, removeMember, leaveGroup, disbandGroup, getKnownPeople } from "../api";
import { sendMusd } from "../settle";
import { usePolling } from "../usePolling";

export default function GroupDetail({ backendUser }) {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { wallets } = useWallets();

  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [settling, setSettling] = useState(false);
  const [settleMsg, setSettleMsg] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [showAddMember, setShowAddMember] = useState(false);
  const [knownPeople, setKnownPeople] = useState([]);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [splitMode, setSplitMode] = useState("equal");
  const [customAmounts, setCustomAmounts] = useState({});
  const [copied, setCopied] = useState(false);

  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [email, setEmail] = useState("");

  function nameOf(userId) {
    if (userId === backendUser.id) return "You";
    const m = members.find((x) => x.id === userId);
    if (!m) return `User ${userId}`;
    return m.email.split("@")[0];
  }

  function expenseStatus(e) {
    const owed = e.splits.filter((s) => !s.is_settled);
    if (owed.length === 0) return { label: "Settled", color: "var(--success)", icon: "●" };
    const settledCount = e.splits.filter((s) => s.is_settled).length;
    if (settledCount > 1) return { label: "Partly settled", color: "#D97706", icon: "◐" };
    return { label: "Unsettled", color: "var(--danger)", icon: "○" };
  }

  function loadAll() {
    getGroup(groupId).then(setGroup).catch((e) => setError(e.message));
    getBalances(groupId).then(setBalances).catch((e) => setError(e.message));
    getExpenses(groupId).then(setExpenses).catch((e) => setError(e.message));
    getGroupMembers(groupId).then(setMembers).catch((e) => setError(e.message));
  }
  useEffect(() => { loadAll(); }, [groupId]);
  useEffect(() => { if (showAddMember) getKnownPeople().then(setKnownPeople).catch(() => {}); }, [showAddMember]);
  usePolling(loadAll, 2000);

  async function handleAddExpense() {
    if (!amount || !desc.trim()) return;
    setError("");
    try {
      if (splitMode === "equal") {
        await createExpense(Number(groupId), backendUser.id, Number(amount), desc);
      } else {
        const splits = members
          .filter((m) => customAmounts[m.id] && Number(customAmounts[m.id]) > 0)
          .map((m) => ({ user_id: m.id, amount: Number(customAmounts[m.id]) }));
        const sum = splits.reduce((a, b) => a + b.amount, 0);
        if (Math.abs(sum - Number(amount)) > 0.01) {
          setError(`Split total $${sum.toFixed(2)} must equal amount $${Number(amount).toFixed(2)}`);
          return;
        }
        await createExpenseExact(Number(groupId), backendUser.id, Number(amount), desc, splits);
      }
      setAmount(""); setDesc(""); setCustomAmounts({}); setSplitMode("equal"); setShowAddExpense(false); loadAll();
    } catch (e) { setError(e.message); }
  }

  async function handleAddMember() {
    if (!email.trim()) return;
    setError("");
    try {
      await addMember(Number(groupId), email); setEmail(""); setShowAddMember(false); loadAll();
    } catch (e) { setError(e.message); }
  }

  async function handleRemoveMember(userId) {
    setError("");
    try {
      await removeMember(Number(groupId), userId);
      loadAll();
    } catch (e) { setError(e.message); }
  }

  async function handleLeaveOrDisband() {
    setError("");
    const iAmOwner = group.created_by === backendUser.id;
    const confirmMsg = iAmOwner ? "Disband this group? All debts must be settled first." : "Leave this group?";
    if (!confirm(confirmMsg)) return;
    try {
      if (iAmOwner) { await disbandGroup(Number(groupId)); }
      else { await leaveGroup(Number(groupId)); }
      navigate("/");
    } catch (e) { setError(e.message); }
  }

  async function handleInvite() {
    // 已经展开了就收回
    if (inviteLink) {
      setInviteLink("");
      return;
    }
    setError("");
    try {
      const { token } = await createInvite(Number(groupId));
      const link = `${window.location.origin}/join/${token}`;
      setInviteLink(link);
      setCopied(false);
    } catch (e) { setError(e.message); }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function handleSettle(toUser, amt) {
    setError(""); setSettleMsg(""); setSettling(true);
    try {
      const wallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
      if (!wallet) throw new Error("Wallet not found");
      setSettleMsg("Preparing transfer…");
      const { wallet_address } = await getUserWallet(toUser);
      if (!wallet_address) throw new Error("Recipient has no wallet address");
      setSettleMsg("Sending on-chain, please wait…");
      const txHash = await sendMusd(wallet, wallet_address, amt);
      setSettleMsg("Transfer sent, recording…");
      await createSettlement(Number(groupId), backendUser.id, toUser, txHash);
      setSettleMsg(`✅ Settled! Tx: ${txHash}`);
      loadAll();
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes("rejected") || msg.includes("denied")) {
        setSettleMsg("");
      } else {
        setError("Settle failed: " + msg);
      }
    } finally {
      setSettling(false);
    }
  }

  if (!group) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const sectionTitle = { fontSize: 14, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 };
  const iconBtn = { width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--primary)", fontSize: 18, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate("/")} style={{ marginBottom: 12, paddingLeft: 0 }}>‹ Back</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
        <h2 style={{ fontSize: 24, marginBottom: 2 }}>{group.name}</h2>
        <button onClick={() => setShowGroupMenu(!showGroupMenu)}
          style={{ background: "none", border: "none", fontSize: 22, color: "var(--text-muted)", cursor: "pointer", padding: "0 4px", lineHeight: 1 }} title="Group settings">⋯</button>
        {showGroupMenu && (
          <div style={{ position: "absolute", right: 0, top: 30, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", padding: 6, zIndex: 10, minWidth: 140 }}>
            <button onClick={() => { setShowGroupMenu(false); handleLeaveOrDisband(); }}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", color: "var(--danger)", fontSize: 14, cursor: "pointer", fontFamily: "inherit", borderRadius: 6 }}>
              {group.created_by === backendUser.id ? "Disband group" : "Leave group"}
            </button>
          </div>
        )}
      </div>

      {/* Members row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 12 }}>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{group.member_ids.length} members</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleInvite}
            style={{ display: "flex", alignItems: "center", gap: 5, background: inviteLink ? "var(--bg)" : "var(--surface)", color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {inviteLink ? "Hide link" : "🔗 Invite"}
          </button>
          <button onClick={() => setShowAddMember(!showAddMember)}
            style={{ display: "flex", alignItems: "center", gap: 5, background: showAddMember ? "var(--surface)" : "var(--primary)", color: showAddMember ? "var(--text-muted)" : "#fff", border: showAddMember ? "1px solid var(--border)" : "none", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {showAddMember ? "Cancel" : "＋ Add"}
          </button>
        </div>
      </div>

      {/* Member avatars */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {members.map((m) => {
          const iAmOwner = group.created_by === backendUser.id;
          const canRemove = iAmOwner && m.id !== group.created_by;
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 10px 5px 6px" }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--primary)", color: "#fff", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {(m.id === backendUser.id ? "Y" : m.email[0]).toUpperCase()}
              </span>
              <span style={{ fontSize: 13 }}>{m.id === backendUser.id ? "You" : m.email.split("@")[0]}</span>
              {canRemove && (
                <span onClick={() => { if (confirm(`Remove ${m.email.split("@")[0]}?`)) handleRemoveMember(m.id); }}
                  style={{ marginLeft: 2, color: "var(--text-muted)", fontSize: 15, cursor: "pointer", lineHeight: 1 }}
                  title="Remove member">×</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Add member (collapsible) */}
      {showAddMember && (
        <div className="card" style={{ marginBottom: 20 }}>
          {knownPeople.filter((p) => !members.some((m) => m.id === p.id)).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Recent contacts</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {knownPeople.filter((p) => !members.some((m) => m.id === p.id)).map((p) => (
                  <button key={p.id} onClick={() => setEmail(p.email)}
                    style={{ display: "flex", alignItems: "center", gap: 5, background: email === p.email ? "var(--primary)" : "var(--surface)", color: email === p.email ? "#fff" : "var(--text)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px 4px 4px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--primary)", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{p.email[0].toUpperCase()}</span>
                    {p.email.split("@")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email" autoFocus />
            <button className="btn btn-primary" onClick={handleAddMember} style={{ whiteSpace: "nowrap" }}>Add</button>
          </div>
        </div>
      )}

      {inviteLink && (
        <div className="card" style={{ marginBottom: 16, background: "#F5F7FF", borderColor: "var(--primary)" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Send this link — one tap to join (valid 7 days)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" readOnly value={inviteLink} style={{ fontSize: 12 }} onFocus={(e) => e.target.select()} />
            <button className="btn btn-primary" onClick={copyInvite} style={{ whiteSpace: "nowrap" }}>{copied ? "Copied ✓" : "Copy"}</button>
          </div>
        </div>
      )}

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {settleMsg && (
        <div className="card" style={{ marginBottom: 16, background: "#F0FDF9", borderColor: "var(--success)", color: "#065F46", fontSize: 14, wordBreak: "break-all" }}>
          {settleMsg}
        </div>
      )}

      {/* Add expense */}
      <div style={{ marginBottom: 24 }}>
        {!showAddExpense ? (
          <button className="btn btn-primary" onClick={() => setShowAddExpense(true)} style={{ width: "100%", padding: 14 }}>
            + Add expense
          </button>
        ) : (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 15 }}>Add expense</strong>
              <button style={{ ...iconBtn, border: "none" }} onClick={() => setShowAddExpense(false)}>×</button>
            </div>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What for, e.g. Dinner" autoFocus />
            <input className="input tabular" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Total amount" />

            <div style={{ display: "flex", gap: 6, background: "var(--bg)", padding: 4, borderRadius: 10 }}>
              {["equal", "exact"].map((mode) => (
                <button key={mode} onClick={() => setSplitMode(mode)}
                  style={{ flex: 1, padding: "8px", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                    background: splitMode === mode ? "var(--surface)" : "transparent",
                    color: splitMode === mode ? "var(--primary)" : "var(--text-muted)",
                    boxShadow: splitMode === mode ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
                  {mode === "equal" ? "Split evenly" : "By amount"}
                </button>
              ))}
            </div>

            {splitMode === "exact" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {members.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 14 }}>{m.id === backendUser.id ? "You" : m.email.split("@")[0]}</span>
                    <input className="input tabular" type="number" style={{ width: 100 }} placeholder="0"
                      value={customAmounts[m.id] || ""}
                      onChange={(e) => setCustomAmounts({ ...customAmounts, [m.id]: e.target.value })} />
                  </div>
                ))}
                {(() => {
                  const sum = members.reduce((a, m) => a + (Number(customAmounts[m.id]) || 0), 0);
                  const total = Number(amount) || 0;
                  const ok = Math.abs(sum - total) < 0.01 && total > 0;
                  return (
                    <div style={{ fontSize: 13, textAlign: "right", color: ok ? "var(--success)" : "var(--text-muted)" }}>
                      Assigned ${sum.toFixed(2)} / ${total.toFixed(2)} {ok ? "✓" : ""}
                    </div>
                  );
                })()}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleAddExpense}>
              {splitMode === "equal" ? "Add · split evenly" : "Add · by amount"}
            </button>
            <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Paid by you</div>
          </div>
        )}
      </div>

      {/* Balances */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionTitle}>To settle</div>
        {balances.filter((b) => b.from_user === backendUser.id || b.to_user === backendUser.id).length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center" }}>You're all settled ✓</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {balances.filter((b) => b.from_user === backendUser.id || b.to_user === backendUser.id).map((b, i) => {
              const iOweThis = b.from_user === backendUser.id;
              return (
                <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderColor: iOweThis ? "var(--danger)" : "var(--border)" }}>
                  <div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                      {iOweThis ? <>You owe <strong style={{ color: "var(--text)" }}>{nameOf(b.to_user)}</strong></> : <><strong style={{ color: "var(--text)" }}>{nameOf(b.from_user)}</strong> owes you</>}
                    </div>
                    <div className="tabular" style={{ fontSize: 26, fontWeight: 700, color: iOweThis ? "var(--danger)" : "var(--success)", marginTop: 2 }}>
                      ${b.amount}
                    </div>
                  </div>
                  {iOweThis && (
                    <button className="btn btn-success" onClick={() => handleSettle(b.to_user, b.amount)} disabled={settling || wallets.length === 0}>
                      {wallets.length === 0 ? "Loading" : settling ? "Sending…" : "Settle"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <div style={sectionTitle}>History</div>
        {expenses.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center" }}>No expenses yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {expenses.map((e) => {
              const st = expenseStatus(e);
              const open = expandedId === e.id;
              return (
                <div key={e.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div onClick={() => setExpandedId(open ? null : e.id)} style={{ padding: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{e.description}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>Paid by {nameOf(e.paid_by)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 600 }}>${e.amount}</div>
                      <div style={{ fontSize: 12, color: st.color, marginTop: 2 }}>{st.icon} {st.label}</div>
                    </div>
                  </div>
                  {open && (
                    <div style={{ padding: "0 14px 12px", borderTop: "1px solid var(--border)" }}>
                      {e.splits.map((s, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}>
                          <span>{nameOf(s.user_id)}</span>
                          <span className="tabular" style={{ color: "var(--text-muted)" }}>
                            ${s.amount} · <span style={{ color: s.user_id === e.paid_by ? "var(--text-muted)" : s.is_settled ? "var(--success)" : "var(--danger)" }}>
                              {s.user_id === e.paid_by ? "paid" : s.is_settled ? "settled" : "unsettled"}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
