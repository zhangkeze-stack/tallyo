import { getAccessToken } from "@privy-io/react-auth";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

// 统一的请求函数：自动带 token；遇 401 自动刷新 token 重试一次
async function request(path, options = {}, isRetry = false) {
  // 每次都取最新 token（Privy 会在临近过期时自动刷新）
  const token = await getAccessToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  // token 失效导致的 401：强制刷新一次 token 再重试（用户无感）
  if (res.status === 401 && !isRetry) {
    try {
      await getAccessToken(); // 触发刷新
    } catch {}
    return request(path, options, true); // 重试一次
  }

  // 重试后仍 401：会话彻底失效，广播事件让 App 引导重新登录
  if (res.status === 401 && isRetry) {
    window.dispatchEvent(new CustomEvent("tallyo:session-expired"));
    throw new Error("Your session has expired. Please log in again.");
  }

  if (!res.ok) {
    let detail = "Request failed";
    try { detail = (await res.json()).detail || detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// 健康检查（不需要 token）
export async function getHealth() {
  const res = await fetch(`${BASE}/`);
  return res.json();
}

// 登录同步（不需要 token，因为这时候正在建立身份）
// Login sync: sends the Privy token, so the backend only trusts the verified identity
export const syncUser = (email, walletAddress, privyDid) =>
  request(`/auth/sync`, { method: "POST", body: JSON.stringify({ email, wallet_address: walletAddress, privy_did: privyDid }) });

// Testnet: ask the backend to top up this user's own empty wallet (runs in the background)
export const fundMe = () => request(`/me/fund`, { method: "POST" });

// —— 以下都自动带 token ——
export const getMyGroups = (userId) => request(`/users/${userId}/groups`);

export const createGroup = (name, createdBy, memberIds) =>
  request(`/groups`, { method: "POST", body: JSON.stringify({ name, created_by: createdBy, member_ids: memberIds }) });

export const getGroup = (groupId) => request(`/groups/${groupId}`);

export const getBalances = (groupId) => request(`/groups/${groupId}/balances`);

export const getExpenses = (groupId) => request(`/groups/${groupId}/expenses`);

export const getGroupMembers = (groupId) => request(`/groups/${groupId}/members/detail`);

export const createExpense = (groupId, paidBy, amount, description) =>
  request(`/expenses`, { method: "POST", body: JSON.stringify({ group_id: groupId, paid_by: paidBy, amount, description, split_mode: "equal" }) });

// 按金额记账（exact 模式）
export const createExpenseExact = (groupId, paidBy, amount, description, customSplits) =>
  request(`/expenses`, { method: "POST", body: JSON.stringify({ group_id: groupId, paid_by: paidBy, amount, description, split_mode: "exact", custom_splits: customSplits }) });

export const addMember = (groupId, email) =>
  request(`/groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ email }) });

export const getUserWallet = (userId) => request(`/users/${userId}/wallet`);

export const createSettlement = (groupId, fromUser, toUser, txHash) =>
  request(`/settlements`, { method: "POST", body: JSON.stringify({ group_id: groupId, from_user: fromUser, to_user: toUser, tx_hash: txHash }) });

// 生成邀请链接
export const createInvite = (groupId) =>
  request(`/groups/${groupId}/invite`, { method: "POST" });

// 查看邀请信息（落地页用，不需登录）
export async function getInvite(token) {
  const res = await fetch(`${BASE}/invite/${token}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "This invite is not valid"); }
  return res.json();
}

// 接受邀请（登录用户加入群）
export const acceptInvite = (token) =>
  request(`/invite/${token}/accept`, { method: "POST" });

// 生成收款链接
export const createPaymentLink = (amount, note) =>
  request(`/payment-links`, { method: "POST", body: JSON.stringify({ amount, note }) });

// 查收款链接信息（落地页用，不需登录）
export async function getPaymentLink(token) {
  const res = await fetch(`${BASE}/payment-links/${token}`);
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "This payment link is not valid"); }
  return res.json();
}

// 标记已付
export const markPaid = (token, txHash) =>
  request(`/payment-links/${token}/mark-paid?tx_hash=${encodeURIComponent(txHash)}`, { method: "POST" });

// 按邮箱查用户
export const getUserByEmail = (email) => request(`/users/by-email/${encodeURIComponent(email)}`);

// 我最近转账过的人
export const getRecentPayees = () => request(`/me/recent-payees`);

// 记录直接转账
export const recordDirectTransfer = (toUser, amount, txHash, note) =>
  request(`/direct-transfers?to_user=${toUser}&amount=${amount}&tx_hash=${encodeURIComponent(txHash)}${note ? `&note=${encodeURIComponent(note)}` : ""}`, { method: "POST" });

// 我的资金流水
export const getMyTransactions = () => request(`/me/transactions`);

// 群主删除成员
export const removeMember = (groupId, userId) =>
  request(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });

// 退出群
export const leaveGroup = (groupId) =>
  request(`/groups/${groupId}/leave`, { method: "POST" });

// 解散群
export const disbandGroup = (groupId) =>
  request(`/groups/${groupId}`, { method: "DELETE" });

// 我认识的人（共处过群）
export const getKnownPeople = () => request(`/me/known-people`);
