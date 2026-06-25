import Link from "next/link";

export const metadata = { title: "Compliance — Pulso (Paraguay)" };

export default function CompliancePage() {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-16 prose-sm sm:prose dark:prose-invert">
      <p className="text-[11px] font-medium uppercase tracking-wider text-accent-500">Regulatory framework</p>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-1">
        Pulso & Paraguayan regulation
      </h1>
      <p className="text-ink-500 dark:text-ink-400 mt-3 leading-relaxed">
        Pulso is operated as a <strong>research and education tool</strong>. All trading uses
        virtual credits — there are no real-money deposits, withdrawals, or payouts. This page
        documents how that classification interacts with the principal Paraguayan agencies that
        would regulate a real-money equivalent, and how we'd report to each one if and when
        Pulso moved to a regulated footing.
      </p>

      <Section title="Status today">
        <p>
          Because no real funds change hands and the platform pays no monetary winnings,
          Pulso is <strong>not</strong> presently within the perimeter of:
        </p>
        <ul>
          <li><strong>CONAJZAR</strong> (Comisión Nacional de Juegos de Azar — gambling regulator). Triggers on games of chance for valuable consideration.</li>
          <li><strong>CNV</strong> (Comisión Nacional de Valores — securities regulator). Triggers on the public offering of securities and on regulated trading venues.</li>
          <li><strong>BCP</strong> (Banco Central del Paraguay — payments / FX). Triggers on regulated payments or e-money issuance.</li>
        </ul>
        <p>
          We still apply <strong>defensive compliance hygiene</strong> appropriate to a service that
          could one day move to a regulated footing: KYC fields, audit-grade activity logging,
          and reportable transaction exports.
        </p>
      </Section>

      <Section title="If we ever moved to real money — what changes">
        <ul>
          <li>
            <strong>CONAJZAR</strong> is the most likely supervisor for binary-outcome markets settled
            in money (Law 1.016/97 framework). Authorization, capital, technical controls, and
            anti-money-laundering filings would be required.
          </li>
          <li>
            <strong>CNV</strong> is relevant if products are characterized as securities, swaps, or
            derivative contracts (Law 5.810/2017 modernized the securities-market regime).
          </li>
          <li>
            <strong>SEPRELAD</strong> (Secretaría de Prevención de Lavado de Dinero o Bienes) imposes
            reporting obligations on regulated entities — KYC, beneficial-ownership, suspicious-
            transaction reports (ROS) — under Law 1.015/97 and successor regulations.
          </li>
          <li>
            <strong>SET</strong> (Subsecretaría de Estado de Tributación) — winnings would be subject to
            IRACIS/IRP/IVA depending on entity status.
          </li>
        </ul>
      </Section>

      <Section title="Data protection (Law 6534/2020)">
        <p>
          We treat handles, emails, KYC fields, IP addresses, and transaction history as personal
          data subject to Paraguay's Law 6534/2020 (and any successor data-protection statute).
          Lawful bases:
        </p>
        <ul>
          <li><em>Contract performance</em> — to operate the user's account.</li>
          <li><em>Legitimate interest</em> — for fraud prevention and platform integrity.</li>
          <li><em>Legal obligation</em> — to retain records and respond to regulator requests.</li>
        </ul>
        <p>
          Users may request access, correction, or deletion of personal data via the in-app
          compliance form (subject to legal-retention overrides).
        </p>
      </Section>

      <Section title="Regulator-ready exports">
        <p>
          Admins can produce a regulator-ready audit CSV for any date range from the
          {" "}<Link href="/admin/cashflow" className="text-accent-500 underline">Cashflow page</Link>.
          The export includes one row per trade with: trade ID, UTC timestamp, market ID +
          category, side, price, quantity, notional, and the submitting user's handle, email,
          country, full name (if provided in KYC), national-ID number, and AML-review flag.
        </p>
        <p>
          The format is intended to be ingestible by SEPRELAD-style reporting and CNV
          record-keeping workflows without further transformation.
        </p>
      </Section>

      <Section title="User responsibilities">
        <ul>
          <li>Provide accurate KYC information when prompted. See <Link href="/settings/compliance" className="text-accent-500 underline">your compliance profile</Link>.</li>
          <li>Do not use the platform for prohibited purposes: structuring transactions to evade reporting, market manipulation, or use of stolen identity.</li>
          <li>Confirm that the platform is permitted in your jurisdiction before signing up.</li>
        </ul>
      </Section>

      <p className="text-xs text-ink-500 dark:text-ink-400 mt-12 italic">
        This page is a plain-language summary intended for general orientation. It is not legal
        advice. Operating any prediction-market service in Paraguay should be reviewed by
        licensed Paraguayan counsel before launch.
      </p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="text-sm leading-relaxed text-ink-700 dark:text-ink-300 mt-3 space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:font-semibold">
        {children}
      </div>
    </section>
  );
}
