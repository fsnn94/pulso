"use client";

import Link from "next/link";
import { hasCap } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AdminPage() {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-12 text-center text-sm text-ink-500">Cargando...</div>;
  if (!user)   return <div className="p-12 text-center text-sm text-ink-500"><Link href="/login" className="underline">Ingresa</Link> para acceder al admin.</div>;
  if (!user.is_admin) return <div className="p-12 text-center text-sm text-ink-500">Solo para admins.</div>;

  const can = (cap: string) => hasCap(user, cap);

  return (
    <div className="view-enter max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Admin</h1>
          <p className="text-ink-500 dark:text-ink-400 text-sm mt-1">Herramientas de administración. Ves solo las secciones habilitadas para tu cuenta.</p>
        </div>
        {user.is_superadmin && (
          <span className="text-[11px] font-medium uppercase tracking-wider px-2 py-1 rounded-full bg-accent-500/10 text-accent-500">
            Admin principal
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {can("markets") && (
          <Card href="/admin/markets" eyebrow="Operatoria" title="Mercados"
                body="Ver, filtrar por categoría, ordenar por cierre, crear y resolver mercados." />
        )}
        {can("proposals") && (
          <Card href="/admin/proposals" eyebrow="Cola de revisión" title="Propuestas de usuarios"
                body="Aprobar, editar o rechazar mercados entrantes." />
        )}
        {can("cashflow") && (
          <Card href="/admin/cashflow" eyebrow="Vista en tiempo real" title="Flujo de caja y cinta en vivo"
                body="Volumen de operaciones, P&L, export de auditoría." />
        )}
        {can("aml") && (
          <Card href="/admin/aml" eyebrow="Riesgo" title="Motor de reglas AML"
                body="Operaciones ficticias, velocidad, concentración, fraccionamiento." />
        )}
        {can("resolutions") && (
          <Card href="/admin/resolutions" eyebrow="Ciclo de vida" title="Cola de resoluciones"
                body="Confirmar o anular propuestas del resolutor (ventana de 24h)." />
        )}
        {can("users") && (
          <Card href="/admin/users" eyebrow="Cuentas" title="Usuarios"
                body={user.is_superadmin
                  ? "Verificar, deshabilitar, roles de admin, permisos y flags AML."
                  : "Verificar, deshabilitar y flags AML."} />
        )}
        {can("payments") && (
          <Card href="/admin/payments" eyebrow="Dinero real" title="Pagos"
                body="Confirmar depósitos, aprobar/pagar retiros y reconciliación (wallet-ready)." />
        )}
        {can("kyc") && (
          <Card href="/admin/kyc" eyebrow="Onboarding" title="Verificación de identidad"
                body="Revisar datos + cédula (selfie/frente/dorso) y aprobar o rechazar cuentas nuevas." />
        )}
        <Card href="/compliance" eyebrow="Regulatorio" title="Marco de cumplimiento (Paraguay)"
              body="Postura ante CONAJZAR / CNV / SEPRELAD." />
      </div>
    </div>
  );
}

function Card({ href, eyebrow, title, body }: { href: string; eyebrow: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900/30 p-4 hover:border-accent-500 transition">
      <div className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{eyebrow}</div>
      <div className="font-semibold mt-1">{title}</div>
      <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">{body}</div>
    </Link>
  );
}
