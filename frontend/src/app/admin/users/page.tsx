"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, AdminUserRow, ADMIN_CAPS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usd } from "@/lib/format";

type Filter = "all" | "verified" | "unverified" | "disabled" | "aml";

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [busy, setBusy]   = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!user?.is_admin) return;
    api.adminUsers().then(setUsers).catch(() => setUsers([]));
  }, [user, refreshTick]);

  const refresh = () => setRefreshTick((t) => t + 1);

  const filtered = useMemo(() => {
    let xs = users;
    if (filter === "verified")    xs = xs.filter((u) => u.email_verified && !u.disabled);
    if (filter === "unverified")  xs = xs.filter((u) => !u.email_verified);
    if (filter === "disabled")    xs = xs.filter((u) => u.disabled);
    if (filter === "aml")         xs = xs.filter((u) => u.aml_flag);
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((u) => u.email.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q));
    }
    return xs;
  }, [users, filter, search]);

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-12 text-sm">Cargando...</div>;
  if (!user?.is_admin) {
    return <div className="max-w-5xl mx-auto px-6 py-12 text-sm">Se requiere acceso de admin.</div>;
  }

  const onDisable = async (u: AdminUserRow) => {
    if (u.is_admin) return;
    if (!confirm(`¿Deshabilitar la cuenta de ${u.email}? El usuario no podrá iniciar sesión.`)) return;
    setBusy(u.id);
    try { await api.disableUser(u.id); refresh(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  const onEnable = async (u: AdminUserRow) => {
    setBusy(u.id);
    try { await api.enableUser(u.id); refresh(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  const onVerify = async (u: AdminUserRow) => {
    setBusy(u.id);
    try { await api.forceVerifyEmail(u.id); refresh(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  const onResetCash = async (u: AdminUserRow) => {
    if (!confirm(`¿Resetear el saldo de ${u.email} a $10,000?`)) return;
    setBusy(u.id);
    try { await api.resetUserCash(u.id); refresh(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  const onDelete = async (u: AdminUserRow) => {
    if (!confirm(`¿Eliminar permanentemente a ${u.email}? Esta acción no se puede deshacer.`)) return;
    setBusy(u.id);
    try { await api.deleteUser(u.id); refresh(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  const onPromoteAdmin = async (u: AdminUserRow) => {
    if (!confirm(`¿Promover a ${u.email} a administrador? Va a poder hacer todo lo que hacés vos.`)) return;
    setBusy(u.id);
    try { await api.promoteAdmin(u.id); refresh(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  const onRevokeAdmin = async (u: AdminUserRow) => {
    if (!confirm(`¿Revocar el rol de administrador a ${u.email}?`)) return;
    setBusy(u.id);
    try { await api.revokeAdmin(u.id); refresh(); }
    catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  const onTogglePerm = async (u: AdminUserRow, cap: string) => {
    // Admin legado (admin_perms null) = acceso total: partimos de todas y sacamos.
    const effective = u.admin_perms == null ? ADMIN_CAPS.map((c) => c.key) : u.admin_perms;
    const next = effective.includes(cap) ? effective.filter((c) => c !== cap) : [...effective, cap];
    setBusy(u.id);
    try {
      const updated = await api.setUserPerms(u.id, next);
      setUsers((cur) => cur.map((x) => (x.id === u.id ? updated : x)));
    } catch (e: any) { alert(e?.message ?? "Falló"); }
    finally { setBusy(null); }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Panel admin</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">Usuarios</h1>
        </div>
        <Link href="/admin" className="text-sm text-ink-500 dark:text-ink-400 hover:underline">← Volver al panel</Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          placeholder="Buscar por email o usuario..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm flex-1 min-w-[200px]"
        />
        {(["all", "verified", "unverified", "disabled", "aml"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 px-3 rounded-lg text-xs font-medium ${filter === f
              ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900"
              : "bg-ink-50 dark:bg-ink-900 text-ink-700 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"}`}
          >
            {f === "all" ? "Todos" : f === "verified" ? "Verificados" : f === "unverified" ? "Sin verificar" : f === "disabled" ? "Deshabilitados" : "AML flag"}
          </button>
        ))}
      </div>

      <div className="text-xs text-ink-500 dark:text-ink-400 mb-2">
        Mostrando {filtered.length} de {users.length} usuarios
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0 rounded-xl border border-ink-100 dark:border-ink-800">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 dark:bg-ink-900 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Usuario</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-right px-3 py-2 font-medium">Saldo</th>
              <th className="text-left px-3 py-2 font-medium">País</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-right px-3 py-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <Fragment key={u.id}>
              <tr className="border-t border-ink-100 dark:border-ink-800">
                <td className="px-3 py-3 font-medium">
                  @{u.handle}
                  {u.is_superadmin
                    ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-accent-500/30 text-accent-500 font-semibold">PRINCIPAL</span>
                    : u.is_admin && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-500 font-semibold">ADMIN</span>}
                </td>
                <td className="px-3 py-3 text-xs">{u.email}</td>
                <td className="px-3 py-3 text-right num">{usd(u.cash)}</td>
                <td className="px-3 py-3 text-xs">{u.country ?? "—"}</td>
                <td className="px-3 py-3 text-xs">
                  {u.disabled && <Pill tone="no">Deshabilitado</Pill>}
                  {!u.email_verified && !u.disabled && <Pill tone="warn">Sin verificar</Pill>}
                  {u.email_verified && !u.disabled && <Pill tone="yes">Verificado</Pill>}
                  {u.aml_flag && <span className="ml-1"><Pill tone="warn">AML</Pill></span>}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-1 flex-wrap">
                    {!u.email_verified && !u.disabled && (
                      <ActionButton onClick={() => onVerify(u)} busy={busy === u.id} tone="yes">
                        Marcar verificado
                      </ActionButton>
                    )}
                    <ActionButton onClick={() => onResetCash(u)} busy={busy === u.id} tone="default">
                      Reset saldo
                    </ActionButton>
                    {user.is_superadmin && !u.is_admin && (
                      <ActionButton onClick={() => onPromoteAdmin(u)} busy={busy === u.id} tone="yes">
                        Promover a admin
                      </ActionButton>
                    )}
                    {user.is_superadmin && u.is_admin && !u.is_superadmin && (
                      <ActionButton onClick={() => onRevokeAdmin(u)} busy={busy === u.id} tone="warn">
                        Revocar admin
                      </ActionButton>
                    )}
                    {!u.disabled && !u.is_admin && (
                      <ActionButton onClick={() => onDisable(u)} busy={busy === u.id} tone="warn">
                        Deshabilitar
                      </ActionButton>
                    )}
                    {u.disabled && (
                      <ActionButton onClick={() => onEnable(u)} busy={busy === u.id} tone="yes">
                        Habilitar
                      </ActionButton>
                    )}
                    <ActionButton onClick={() => onDelete(u)} busy={busy === u.id} tone="no">
                      Eliminar
                    </ActionButton>
                  </div>
                </td>
              </tr>

              {user.is_superadmin && u.is_admin && (
                <tr className="bg-ink-50/50 dark:bg-ink-900/20">
                  <td colSpan={6} className="px-3 pb-3 pt-0">
                    {u.is_superadmin ? (
                      <span className="text-[11px] text-ink-500 dark:text-ink-400">Admin principal · acceso total a todas las secciones.</span>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">Permisos:</span>
                        {ADMIN_CAPS.map((c) => {
                          const on = u.admin_perms == null || u.admin_perms.includes(c.key);
                          return (
                            <button key={c.key} onClick={() => onTogglePerm(u, c.key)} disabled={busy === u.id}
                              className={`h-7 px-2.5 rounded-full text-[11px] font-medium border disabled:opacity-50 transition-colors ${on
                                ? "bg-accent-500/15 text-accent-500 border-accent-500/30"
                                : "bg-transparent text-ink-500 dark:text-ink-400 border-ink-200 dark:border-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800"}`}>
                              {on ? "✓ " : ""}{c.label}
                            </button>
                          );
                        })}
                        {u.admin_perms == null && <span className="text-[11px] text-ink-400 dark:text-ink-500">(admin legado: acceso total)</span>}
                      </div>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-ink-500 dark:text-ink-400 text-sm">No hay usuarios que coincidan con el filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "yes" | "no" | "warn"; children: React.ReactNode }) {
  const c = tone === "yes" ? "bg-yes-500/15 text-yes-500"
          : tone === "no"  ? "bg-no-500/15 text-no-500"
          : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-500";
  return <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${c}`}>{children}</span>;
}

function ActionButton({ onClick, busy, tone, children }: {
  onClick: () => void; busy: boolean; tone: "yes" | "no" | "warn" | "default"; children: React.ReactNode;
}) {
  const c = tone === "yes"     ? "bg-yes-500/15 text-yes-700 dark:text-yes-500 hover:bg-yes-500/25"
          : tone === "no"      ? "bg-no-500/15 text-no-700 dark:text-no-500 hover:bg-no-500/25"
          : tone === "warn"    ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-500 hover:bg-yellow-500/25"
          : "bg-ink-50 dark:bg-ink-800 text-ink-700 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-700";
  return (
    <button onClick={onClick} disabled={busy}
            className={`h-7 px-2.5 rounded-md text-[11px] font-medium disabled:opacity-50 ${c}`}>
      {children}
    </button>
  );
}
