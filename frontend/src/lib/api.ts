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
    throw new ApiError(errorMessage(detail, res.status), res.status, detail);
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

/** Convierte el cuerpo de error del backend en un mensaje legible.
 *  FastAPI devuelve validaciones (422) como array de {loc,msg,type}; sin esto
 *  el frontend mostraba "[object Object]". */
function errorMessage(detail: any, status: number): string {
  const d = detail?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const parts = d.map((e: any) => {
      const loc = Array.isArray(e?.loc) ? e.loc.filter((x: any) => x !== "body").pop() : undefined;
      const msg = e?.msg ?? "valor inválido";
      return loc ? `${loc}: ${msg}` : msg;
    });
    return parts.join(" · ") || `HTTP ${status}`;
  }
  if (d && typeof d === "object" && typeof d.msg === "string") return d.msg;
  if (typeof detail?.message === "string") return detail.message;
  return `HTTP ${status}`;
}

export const api = {
  base: API_BASE,
  wsUrl(): string {
    return API_BASE.replace(/^http/, "ws") + "/ws";
  },

  // auth
  register: (b: RegisterInput) =>
    request<{ access_token: string; verification_link?: string | null }>("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  uploadKycDocument: async (side: "FRONT" | "BACK" | "SELFIE", file: File) => {
    const fd = new FormData();
    fd.append("side", side);
    fd.append("file", file);
    const t = tokens.get();
    const res = await fetch(`${API_BASE}/auth/kyc/documents`, {
      method: "POST",
      headers: t ? { Authorization: `Bearer ${t}` } : {},   // sin Content-Type: el browser pone el boundary
      body: fd,
    });
    if (!res.ok) {
      let d: any; try { d = await res.json(); } catch { d = { detail: res.statusText }; }
      throw new ApiError(errorMessage(d, res.status), res.status, d);
    }
    return res.json() as Promise<KycDocumentMeta>;
  },
  submitKycForReview: () => request<{ kyc_status: string; sla_hours: number }>("/auth/kyc/submit", { method: "POST" }),
  login: (b: { email: string; password: string }) =>
    request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => request<User>("/auth/me"),
  changePassword: (b: { current_password: string; new_password: string }) =>
    request<{ access_token: string }>("/auth/change-password", { method: "POST", body: JSON.stringify(b) }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean; reset_link?: string | null }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    request<{ access_token: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) }),
  changeHandle: (handle: string) =>
    request<User>("/auth/handle", { method: "PATCH", body: JSON.stringify({ handle }) }),
  verifyEmail: (token: string) => request<User>("/auth/verify", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: () => request<{ access_token: string; verification_link?: string | null }>("/auth/resend-verification", { method: "POST" }),
  submitKyc: (b: { full_name: string; country: string; id_number: string; date_of_birth: string; document_type?: "CEDULA" | "PASSPORT" }) =>
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
  marketHistory: (id: string, range: EquityRange = "all") =>
    request<MarketHistory>(`/markets/${id}/history?range=${range}`),
  marketSummary: (id: string) => request<MarketSummary>(`/markets/${id}/summary`),
  getBook:    (id: string) => request<Book>(`/markets/${id}/book`),
  getTrades:  (id: string) => request<Trade[]>(`/markets/${id}/trades`),

  // comments
  marketComments: (id: string) => request<Comment[]>(`/markets/${id}/comments`),
  postComment: (id: string, body: string) =>
    request<Comment>(`/markets/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  deleteComment: (id: string, commentId: string) =>
    request<{ ok: boolean }>(`/markets/${id}/comments/${commentId}`, { method: "DELETE" }),

  // orders
  placeOrder: (b: OrderIn) => request<Order>("/orders", { method: "POST", body: JSON.stringify(b) }),
  myOrders:   (open_only = false) => request<Order[]>(`/orders?open_only=${open_only}`),
  cancelOrder:(id: string) => request<Order>(`/orders/${id}`, { method: "DELETE" }),

  // portfolio
  portfolio:  () => request<Portfolio>("/portfolio"),
  equityHistory: (range: EquityRange = "all") =>
    request<EquityHistory>(`/portfolio/history?range=${range}`),

  // news (item #10)
  news: (category = "all") =>
    request<News>(`/news?category=${encodeURIComponent(category)}`),

  // notifications (item #8)
  notifications: (unread_only = false, limit = 50) =>
    request<Notification[]>(`/notifications?unread_only=${unread_only}&limit=${limit}`),
  // Watchlist (favoritos)
  watchlist: () => request<Market[]>("/watchlist"),
  watchlistIds: () => request<string[]>("/watchlist/ids"),
  addWatch: (marketId: string) => request<{ watching: boolean }>(`/watchlist/${marketId}`, { method: "POST" }),
  removeWatch: (marketId: string) => request<{ watching: boolean }>(`/watchlist/${marketId}`, { method: "DELETE" }),

  unreadCount: () => request<{ unread: number }>("/notifications/unread-count"),
  markAllRead: () => request<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),
  markRead: (id: string) => request<Notification>(`/notifications/${id}/read`, { method: "POST" }),

  // leaderboard
  leaderboard: (metric: "pnl" | "volume" | "trades" = "pnl", limit = 50) =>
    request<Leaderboard>(`/leaderboard?metric=${metric}&limit=${limit}`),

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
  editMarket: (id: string, b: { closes_at?: string; resolution_config?: Record<string, any> | null; resolution_source?: string }) =>
    request<Market>(`/admin/markets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(b) }),
  resolveMarket: (id: string, outcome: "YES" | "NO") =>
    request<Market>(`/admin/markets/${id}/resolve`, { method: "POST", body: JSON.stringify({ outcome }) }),
  listProposals: (status?: "PENDING" | "APPROVED" | "REJECTED") =>
    request<Proposal[]>(`/admin/proposals${status ? `?status=${status}` : ""}`),
  reviewProposal: (id: string, b: { decision: "APPROVED" | "REJECTED"; review_note?: string; resolution_config?: Record<string, any> | null; closes_at?: string }) =>
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
  setUserPerms: (userId: string, perms: string[]) =>
    request<AdminUserRow>(`/admin/users/${userId}/perms`, { method: "PUT", body: JSON.stringify({ perms }) }),
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

  // Payments (dinero real, wallet-ready)
  myBalance: (currency?: string) =>
    request<Balance>(`/payments/balance${currency ? `?currency=${currency}` : ""}`),
  myDeposits: () => request<Deposit[]>("/payments/deposits"),
  myWithdrawals: () => request<Withdrawal[]>("/payments/withdrawals"),
  createDeposit: (b: { amount: string; currency: string }) =>
    request<Deposit>("/payments/deposits", { method: "POST", body: JSON.stringify(b) }),
  createWithdrawal: (b: { amount: string; currency: string; destination?: Record<string, unknown> }) =>
    request<Withdrawal>("/payments/withdrawals", { method: "POST", body: JSON.stringify(b) }),
  // admin
  adminDeposits: (status?: string) =>
    request<Deposit[]>(`/admin/payments/deposits${status ? `?status=${status}` : ""}`),
  confirmDeposit: (id: string) =>
    request<Deposit>(`/admin/payments/deposits/${id}/confirm`, { method: "POST" }),
  failDeposit: (id: string, reason?: string) =>
    request<Deposit>(`/admin/payments/deposits/${id}/fail${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`, { method: "POST" }),
  adminWithdrawals: (status?: string) =>
    request<Withdrawal[]>(`/admin/payments/withdrawals${status ? `?status=${status}` : ""}`),
  approveWithdrawal: (id: string) =>
    request<Withdrawal>(`/admin/payments/withdrawals/${id}/approve`, { method: "POST" }),
  markWithdrawalPaid: (id: string, b: { provider_ref?: string; note?: string } = {}) =>
    request<Withdrawal>(`/admin/payments/withdrawals/${id}/mark-paid`, { method: "POST", body: JSON.stringify(b) }),
  rejectWithdrawal: (id: string, b: { note?: string } = {}) =>
    request<Withdrawal>(`/admin/payments/withdrawals/${id}/reject`, { method: "POST", body: JSON.stringify(b) }),
  reconciliation: () => request<ReconciliationRow[]>("/admin/payments/reconciliation"),

  // KYC admin (revisión de identidad)
  adminKycList: (status = "UNDER_REVIEW") =>
    request<KycProfile[]>(`/admin/kyc?status=${status}`),
  adminKycGet: (userId: string) => request<KycProfile>(`/admin/kyc/${userId}`),
  approveKyc: (userId: string) => request<KycProfile>(`/admin/kyc/${userId}/approve`, { method: "POST" }),
  rejectKyc: (userId: string, reason: string) =>
    request<KycProfile>(`/admin/kyc/${userId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  // El documento requiere auth (no sirve <img src>): se trae como blob → objectURL.
  kycDocBlobUrl: async (userId: string, docId: string): Promise<string> => {
    const t = tokens.get();
    const res = await fetch(`${API_BASE}/admin/kyc/${userId}/documents/${docId}`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!res.ok) throw new ApiError("No se pudo cargar el documento", res.status, null);
    return URL.createObjectURL(await res.blob());
  },
};

// ---------- types
export type User = {
  id: string; email: string; handle: string; is_admin: boolean; cash: number;
  is_superadmin?: boolean;
  admin_perms?: string[] | null;   // null = admin legado / superadmin (acceso total)
  email_verified: boolean;
  full_name?: string | null;
  country?: string | null;
  kyc_status?: "NONE" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  kyc_rejection_reason?: string | null;
  kyc_completed_at?: string | null;
};

// Registro con KYC
export type RegisterInput = {
  email: string; handle: string; password: string; accepted_disclaimer: boolean;
  first_name: string; last_name: string; date_of_birth: string; id_number: string;
  country: string; phone: string; address: string; document_type: "CEDULA" | "PASSPORT";
};
export type KycDocumentMeta = { id: string; side: "FRONT" | "BACK" | "SELFIE"; content_type?: string | null; uploaded_at: string };
export type KycProfile = {
  user_id: string; email: string; handle: string;
  first_name?: string | null; last_name?: string | null; full_name?: string | null;
  country?: string | null; id_number?: string | null; date_of_birth?: string | null;
  phone?: string | null; address?: string | null; document_type?: string | null;
  kyc_status: "NONE" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  kyc_rejection_reason?: string | null; created_at: string; documents: KycDocumentMeta[];
};

// Pagos (dinero real, wallet-ready)
export type Balance = { currency: string; balance_minor: number; balance: string };
export type Deposit = {
  id: string; user_id: string; amount_minor: number; currency: string;
  status: "INITIATED" | "PENDING" | "CONFIRMED" | "FAILED" | "REVERSED";
  provider: string; provider_ref?: string | null; failure_reason?: string | null;
  created_at: string; updated_at: string;
};
export type Withdrawal = {
  id: string; user_id: string; amount_minor: number; currency: string;
  status: "REQUESTED" | "APPROVED" | "PROCESSING" | "PAID" | "REJECTED" | "FAILED";
  provider: string; provider_ref?: string | null; failure_reason?: string | null;
  requested_at: string; reviewed_at?: string | null;
};
export type ReconciliationRow = {
  currency: string; users_total: number; payout_payable: number;
  custody: number; fee_revenue: number; balanced: boolean;
};

// Capacidades del panel de admin (deben coincidir con ADMIN_CAPABILITIES del backend).
export const ADMIN_CAPS: { key: string; label: string; href: string }[] = [
  { key: "markets",     label: "Mercados",      href: "/admin/markets" },
  { key: "proposals",   label: "Propuestas",    href: "/admin/proposals" },
  { key: "cashflow",    label: "Flujo de caja", href: "/admin/cashflow" },
  { key: "aml",         label: "AML",           href: "/admin/aml" },
  { key: "resolutions", label: "Resoluciones",  href: "/admin/resolutions" },
  { key: "users",       label: "Usuarios",      href: "/admin/users" },
  { key: "payments",    label: "Pagos",         href: "/admin/payments" },
  { key: "kyc",         label: "Verificación",  href: "/admin/kyc" },
];

/** ¿El admin tiene la capacidad `cap`? superadmin y admin legado (perms null) = todo. */
export function hasCap(
  u: { is_superadmin?: boolean; admin_perms?: string[] | null } | null | undefined,
  cap: string,
): boolean {
  if (!u) return false;
  if (u.is_superadmin) return true;
  if (u.admin_perms == null) return true;
  return u.admin_perms.includes(cap);
}
export type MarketStatus = "OPEN" | "CLOSED" | "PROPOSED" | "DISPUTED" | "RESOLVED" | "VOIDED";
export type ResolutionOutcome = "YES" | "NO" | "VOID";
export type Market = {
  id: string; title: string; short_title: string; description: string;
  category: string;
  yes_label: string; no_label: string;
  status: MarketStatus;
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
export type Notification = {
  id: string; kind: string; title: string; body: string;
  market_id: string | null; read_at: string | null; created_at: string;
};
export type Comment = {
  id: string; market_id: string; handle: string; body: string; created_at: string;
};
export type LeaderboardRow = {
  handle: string; pnl: number; realized_pnl: number;
  volume: number; trades: number; markets: number;
};
export type Leaderboard = { metric: "pnl" | "volume" | "trades"; rows: LeaderboardRow[] };
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
export type EquityRange = "24h" | "1w" | "1m" | "1y" | "all";
export type MarketHistory = {
  market_id: string; range: EquityRange;
  points: { ts: string; p: number }[];
};
export type EquityPoint = { ts: string; equity: number; cash: number; pnl: number };
export type EquityHistory = {
  range: EquityRange; starting_credits: number; points: EquityPoint[];
};
export type Headline = {
  title: string; source: string; url: string;
  image: string | null; published_at: string | null;
  description: string | null; category: string;
};
export type NewsCategory = { key: string; label: string };
export type News = {
  enabled: boolean; category: string;
  categories: NewsCategory[]; headlines: Headline[];
};
export type MarketCreateIn = {
  id?: string; title: string; short_title: string; description: string;
  category: string; yes_label?: string; no_label?: string;
  closes_at: string; initial_yes_price?: number;
  resolution_source?: string;
  resolution_config?: Record<string, any> | null;
};
export type ProposalIn = {
  slug: string; title: string; short_title: string; description: string;
  category: string; yes_label?: string; no_label?: string;
  closes_at: string; initial_yes_price?: number;
  resolution_source?: string; rationale?: string;
};
export type Proposal = {
  id: string; submitter_id: string; slug: string;
  title: string; short_title: string; description: string;
  category: string; yes_label?: string; no_label?: string;
  closes_at: string; initial_yes_price: number;
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
  house_total: number;
  house_mm: number;
  house_by_market: { market_id: string | null; title: string | null; amount: number }[];
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
  aml_flag: boolean; disabled: boolean; is_admin: boolean;
  is_superadmin: boolean; admin_perms: string[] | null;
  created_at: string;
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
