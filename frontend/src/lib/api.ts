"use client";

const API_BASE =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000";

const TOKEN_KEY = "pulso.token";

export const tokens = {
  get(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  set(t: string) { localStorage.setItem(TOKEN_KEY, t); },
  clear() { localStorage.removeItem(TOKEN_KEY); },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  const t = tokens.get();
  if (t) headers["Authorization"] = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = { detail: res.statusText }; }
    const msg = detail?.detail || `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public detail: any) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  base: API_BASE,
  wsUrl(): string {
    return API_BASE.replace(/^http/, "ws") + "/ws";
  },

  // auth
  register: (b: { email: string; handle: string; password: string; accepted_disclaimer: boolean }) =>
    request<{ access_token: string; verification_link?: string | null }>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { email: string; password: string }) =>
    request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<User>("/auth/me"),
  verifyEmail: (token: string) => request<User>("/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: () => request<{ access_token: string; verification_link?: string | null }>("/auth/resend-verification", { method: "POST" }),
  submitKyc: (b: { full_name: string; country: string; id_number: string; date_of_birth: string }) =>
    request<User>("/auth/kyc", { method: "POST", body: JSON.stringify(b) }),

  // markets
  listMarkets: (q?: { category?: string; q?: string; sort?: string }) => {
    const p = new URLSearchParams();
    if (q?.category && q.category !== "All") p.set("category", q.category);
    if (q?.q)        p.set("q", q.q);
    if (q?.sort)     p.set("sort", q.sort);
    return request<{ items: Market[] }>(`/markets?${p}`);
  },
  getMarket:  (id: string) => request<Market>(`/markets/${id}`),
  marketSummary: (id: string) => request<MarketSummary>(`/markets/${id}/summary`),
  getBook:    (id: string) => request<Book>(`/markets/${id}/book`),
  getTrades:  (id: string) => request<Trade[]>(`/markets/${id}/trades`),

  // orders
  placeOrder: (b: OrderIn) => request<Order>("/orders", { method: "POST", body: JSON.stringify(b) }),
  myOrders:   (open_only = false) => request<Order[]>(`/orders?open_only=${open_only}`),
  cancelOrder:(id: string) => request<Order>(`/orders/${id}`, { method: "DELETE" }),

  // portfolio
  portfolio:  () => request<Portfolio>("/portfolio"),

  // public profiles (item #7)
  userProfile: (handle: string) => request<PublicProfile>(`/users/${encodeURIComponent(handle)}`),
  userTrades:  (handle: string, limit = 50) =>
    request<PublicTrade[]>(`/users/${encodeURIComponent(handle)}/trades?limit=${limit}`),

  // proposals
  submitProposal: (b: ProposalIn) =>
    request<Proposal>("/markets/proposals", { method: "POST", body: JSON.stringify(b) }),
  myProposals: () => request<Proposal[]>("/markets/proposals/mine"),

  // admin
  createMarket: (b: MarketCreateIn) =>
    request<Market>("/admin/markets", { method: "POST", body: JSON.stringify(b) }),
  resolveMarket: (id: string, outcome: "YES" | "NO") =>
    request<Market>(`/admin/markets/${id}/resolve`, { method: "POST", body: JSON.stringify({ outcome }) }),
  listProposals: (status?: "PENDING" | "APPROVED" | "REJECTED") =>
    request<Proposal[]>(`/admin/proposals${status ? `?status=${status}` : ""}`),
  reviewProposal: (id: string, b: { decision: "APPROVED" | "REJECTED"; review_note?: string }) =>
    request<Proposal>(`/admin/proposals/${id}/review`, { method: "POST", body: JSON.stringify(b) }),
  cashflow: (days = 7) => request<CashflowKpi>(`/admin/cashflow?days=${days}`),
  setCommissionRate: (rate: number) =>
    request<{ ok: boolean; commission_rate: number }>(`/admin/commission-rate`, { method: "PUT", body: JSON.stringify({ rate }) }),
  listCommissions: (limit = 100) => request<CommissionRow[]>(`/admin/commissions?limit=${limit}`),
  adminUsers: (aml_only = false) => request<AdminUserRow[]>(`/admin/users?aml_only=${aml_only}`),
  setAml: (userId: string, flag: boolean, note?: string) => {
    const p = new URLSearchParams({ flag: String(flag) });
    if (note) p.set("note", note);
    return request<{ ok: boolean }>(`/admin/users/${userId}/aml?${p}`, { method: "POST" });
  },
  disableUser: (userId: string) =>
    request<{ ok: boolean; disabled: boolean }>(`/admin/users/${userId}/disable`, { method: "POST" }),
  enableUser: (userId: string) =>
    request<{ ok: boolean; disabled: boolean }>(`/admin/users/${userId}/enable`, { method: "POST" }),
  forceVerifyEmail: (userId: string) =>
    request<{ ok: boolean; email_verified: boolean }>(`/admin/users/${userId}/verify-email`, { method: "POST" }),
  resetUserCash: (userId: string) =>
    request<{ ok: boolean; cash: number }>(`/admin/users/${userId}/reset-cash`, { method: "POST" }),
  deleteUser: (userId: string) =>
    request<{ ok: boolean; deleted: boolean }>(`/admin/users/${userId}`, { method: "DELETE" }),
  promoteAdmin: (userId: string) =>
    request<{ ok: boolean; is_admin: boolean }>(`/admin/users/${userId}/promote-admin`, { method: "POST" }),
  revokeAdmin: (userId: string) =>
    request<{ ok: boolean; is_admin: boolean }>(`/admin/users/${userId}/revoke-admin`, { method: "POST" }),
  auditExportUrl: (from?: string, to?: string) => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to)   p.set("to", to);
    return `${API_BASE}/admin/audit/export.csv?${p}`;
  },

  // AML
  amlSummary: () => request<AmlSummary>("/admin/aml/summary"),
  amlAlerts: (q: { status?: AmlAlertStatus; severity?: AmlSeverity; rule?: string; user_id?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.status)   p.set("status", q.status);
    if (q.severity) p.set("severity", q.severity);
    if (q.rule)     p.set("rule", q.rule);
    if (q.user_id)  p.set("user_id", q.user_id);
    return request<AmlAlert[]>(`/admin/aml/alerts?${p}`);
  },
  reviewAmlAlert: (id: string, b: { action: "ACK" | "DISMISS" | "ESCALATE"; note?: string }) =>
    request<AmlAlert>(`/admin/aml/alerts/${id}/review`, { method: "POST", body: JSON.stringify(b) }),
  triggerAmlScan: () =>
    request<{ ok: boolean; affected: number; open: number }>("/admin/aml/scan", { method: "POST" }),

  // Resolution
  resolutionQueue: () => request<ResolutionProposal[]>("/admin/resolutions/queue"),
  listResolutions: (status?: "PENDING" | "CONFIRMED" | "OVERRIDDEN" | "DISPUTED") =>
    request<ResolutionProposal[]>(`/admin/resolutions${status ? `?status=${status}` : ""}`),
  confirmResolution: (id: string, b: { outcome: ResolutionOutcome; note?: string }) =>
    request<ResolutionProposal>(`/admin/resolutions/${id}/confirm`, { method: "POST", body: JSON.stringify(b) }),
  disputeMarket: (marketId: string, b: { reason: string; evidence_url?: string }) =>
    request<ResolutionProposal>(`/markets/${marketId}/dispute`, { method: "POST", body: JSON.stringify(b) }),

  // AML mutes
  listAmlMutes: (active_only = true) =>
    request<AmlMute[]>(`/admin/aml/mutes?active_only=${active_only}`),
  createAmlMute: (b: { user_id: string; rule_code: string | null; duration_hours: number | null; reason: string }) =>
    request<AmlMute>("/admin/aml/mutes", { method: "POST", body: JSON.stringify(b) }),
  revokeAmlMute: (id: string) =>
    request<AmlMute>(`/admin/aml/mutes/${id}`, { method: "DELETE" }),
};

// ---------- types
export type User = {
  id: string; email: string; handle: string; is_admin: boolean; cash: number;
  email_verified: boolean;
  full_name?: string | null;
  country?: string | null;
  kyc_completed_at?: string | null;
};
export type MarketStatus = "OPEN" | "CLOSED" | "PROPOSED" | "DISPUTED" | "RESOLVED" | "VOIDED";
export type ResolutionOutcome = "YES" | "NO" | "VOID";
export type Market = {
  id: string; title: string; short_title: string; description: string;
  category: string; status: MarketStatus;
  closes_at: string; closed_at?: string | null;
  current_yes_price: number;
  volume_24h: number; liquidity: number; resolution_source: string;
  resolution_config?: Record<string, any> | null;
  resolved_outcome?: "YES" | "NO" | null; resolved_at?: string | null;
};
export type ResolutionProposal = {
  id: string; market_id: string;
  proposed_outcome: ResolutionOutcome | null;
  resolver_code: string;
  source_name: string; source_url: string | null;
  confidence: number; evidence: Record<string, any>;
  proposed_at: string; finalizes_at: string | null;
  status: "PENDING" | "CONFIRMED" | "OVERRIDDEN" | "DISPUTED";
  dispute_count: number;
  confirmed_outcome: ResolutionOutcome | null;
  confirmed_at: string | null;
  confirm_note: string | null;
};
export type Book = {
  yes_bids: { price: number; size: number }[];
  yes_asks: { price: number; size: number }[];
  no_bids:  { price: number; size: number }[];
  no_asks:  { price: number; size: number }[];
};
export type Trade = {
  id: string; market_id: string; side: "YES" | "NO";
  price: number; quantity: number; created_at: string;
  handle?: string | null;
};
export type PublicProfile = {
  handle: string; created_at: string;
  realized_pnl: number; unrealized_pnl: number;
  open_positions: number; markets_traded: number;
  trades_count: number; total_volume: number;
};
export type PublicTrade = {
  id: string; market_id: string;
  market_short_title: string | null; market_status: MarketStatus | null;
  side: "YES" | "NO"; price: number; quantity: number; created_at: string;
};
export type OrderIn = {
  market_id: string; side: "YES" | "NO";
  action: "BUY" | "SELL"; type: "MARKET" | "LIMIT";
  quantity: number; limit_price?: number;
};
export type Order = {
  id: string; market_id: string;
  side: "YES" | "NO"; action: "BUY" | "SELL"; type: "MARKET" | "LIMIT";
  status: "OPEN" | "PARTIAL" | "FILLED" | "CANCELLED";
  quantity: number; filled_quantity: number; avg_fill_price: number | null;
  limit_price: number | null; created_at: string;
};
export type Position = {
  id: string; market_id: string; side: "YES" | "NO";
  shares: number; avg_cost: number; realized_pnl: number;
};
export type Activity = {
  id: string; market_id: string | null; kind: string;
  side: "YES" | "NO" | null;
  quantity: number | null; price: number | null; total: number | null;
  note: string | null; created_at: string;
};
export type Portfolio = {
  cash: number; realized_pnl: number; commissions_paid: number;
  positions: Position[]; activity: Activity[];
};
export type MarketCreateIn = {
  id: string; title: string; short_title: string; description: string;
  category: string; closes_at: string; initial_yes_price?: number;
  resolution_source?: string;
};
export type ProposalIn = {
  slug: string; title: string; short_title: string; description: string;
  category: string; closes_at: string; initial_yes_price?: number;
  resolution_source?: string; rationale?: string;
};
export type Proposal = {
  id: string; submitter_id: string; slug: string;
  title: string; short_title: string; description: string;
  category: string; closes_at: string; initial_yes_price: number;
  resolution_source: string; rationale: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  review_note: string | null;
  reviewed_at: string | null;
  approved_market_id: string | null;
  created_at: string;
};
export type CashflowKpi = {
  volume_24h: number; trades_24h: number; active_users_24h: number;
  open_markets: number; pending_proposals: number; unresolved_pnl_house: number;
  commission_rate: number;
  commission_total: number; commission_period: number; commission_24h: number;
  commission_count: number;
  commission_by_market: { market_id: string | null; title: string | null; amount: number; count: number }[];
  series: { day: string; volume: number; trades: number }[];
  by_category: { category: string; volume: number; trades: number }[];
};
export type CommissionRow = {
  id: string; user_id: string; handle: string;
  market_id: string | null; market_title: string | null;
  source: "CLOSE" | "RESOLVE";
  gross_profit: number; rate: number; amount: number; created_at: string;
};
export type MarketSummary = {
  market_id: string; status: MarketStatus;
  resolved_outcome: "YES" | "NO" | null; resolved_at: string | null; closes_at: string;
  participants: number; total_volume: number; total_contracts: number; total_payout: number;
};
export type AdminUserRow = {
  id: string; handle: string; email: string; cash: number;
  email_verified: boolean; country: string | null;
  aml_flag: boolean; disabled: boolean; is_admin: boolean; created_at: string;
};

export type AmlSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AmlAlertStatus = "OPEN" | "ACKED" | "DISMISSED" | "ESCALATED";
export type AmlAlert = {
  id: string; user_id: string; rule_code: string;
  severity: AmlSeverity; message: string; evidence: Record<string, any>;
  market_id: string | null; status: AmlAlertStatus;
  review_note: string | null; reviewed_at: string | null;
  created_at: string; updated_at: string;
};
export type AmlSummary = {
  open_count: number;
  by_severity: Record<string, number>;
  by_rule: Record<string, number>;
  recent: AmlAlert[];
};
export type AmlMute = {
  id: string; user_id: string;
  rule_code: string | null;       // null = "all rules"
  reason: string;
  expires_at: string | null;       // null = "until revoked"
  muted_by: string; created_at: string;
  revoked_at: string | null; revoked_by: string | null;
};
