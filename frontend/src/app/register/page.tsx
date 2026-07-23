"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const COUNTRIES = [
  ["PY", "Paraguay"], ["AR", "Argentina"], ["BR", "Brasil"], ["CL", "Chile"],
  ["UY", "Uruguay"], ["BO", "Bolivia"], ["US", "Estados Unidos"], ["ES", "España"],
  ["MX", "México"],
];

type Docs = { FRONT: File | null; BACK: File | null; SELFIE: File | null };

function ageFrom(dateStr: string): number | null {
  if (!dateStr) return null;
  const dob = new Date(dateStr);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({
    first_name: "", last_name: "", date_of_birth: "", id_number: "", country: "PY",
    phone: "", address: "", email: "", handle: "", password: "",
    document_type: "CEDULA" as "CEDULA" | "PASSPORT",
  });
  const [docs, setDocs] = useState<Docs>({ FRONT: null, BACK: null, SELFIE: null });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string>("");   // texto de progreso
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);   // sla_hours cuando termina

  const age = ageFrom(f.date_of_birth);
  const underage = age !== null && age < 18;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (underage) { setErr("Debes ser mayor de 18 años."); return; }
    if (!docs.FRONT || !docs.BACK || !docs.SELFIE) { setErr("Subí las 3 imágenes: frente, dorso y selfie con la cédula."); return; }
    setBusy(true);
    try {
      setStep("Creando cuenta...");
      await register({
        email: f.email.trim(), handle: f.handle.trim(), password: f.password,
        accepted_disclaimer: accepted, first_name: f.first_name.trim(), last_name: f.last_name.trim(),
        date_of_birth: new Date(f.date_of_birth).toISOString(), id_number: f.id_number.trim(),
        country: f.country, phone: f.phone.trim(), address: f.address.trim(),
        document_type: f.document_type,
      });
      setStep("Subiendo documentos...");
      await api.uploadKycDocument("FRONT", docs.FRONT);
      await api.uploadKycDocument("BACK", docs.BACK);
      await api.uploadKycDocument("SELFIE", docs.SELFIE);
      setStep("Enviando a revisión...");
      const res = await api.submitKycForReview();
      setDone(res.sla_hours);
    } catch (e: any) {
      setErr(e?.message ?? "No se pudo crear la cuenta");
    } finally { setBusy(false); setStep(""); }
  };

  if (done !== null) {
    return (
      <div className="max-w-md mx-auto py-16 sm:py-24 px-4 sm:px-6 text-center view-enter">
        <div className="w-14 h-14 mx-auto rounded-full bg-accent-500/10 text-accent-500 flex items-center justify-center text-2xl">✓</div>
        <h1 className="text-2xl font-semibold tracking-tight mt-4">Cuenta creada</h1>
        <p className="text-ink-500 dark:text-ink-400 text-sm mt-3 leading-relaxed">
          Tu identidad está en revisión por nuestro equipo. La verificación demora hasta {done} horas;
          te avisaremos por correo cuando puedas empezar a operar.
        </p>
        <button onClick={() => router.push("/")} className="mt-6 h-11 px-5 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium">
          Entendido
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-10 sm:py-14 px-4 sm:px-6 view-enter">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Crear cuenta</h1>
      <p className="text-ink-500 dark:text-ink-400 text-sm mb-8">
        Verificamos la identidad de cada usuario. Completá tus datos y subí tu cédula; el equipo revisa y habilita tu cuenta (hasta 48 hs).
      </p>

      <form onSubmit={submit} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-accent-500 mb-2">Datos personales</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombres"><input required className={inp} value={f.first_name} onChange={set("first_name")}/></Field>
            <Field label="Apellidos"><input required className={inp} value={f.last_name} onChange={set("last_name")}/></Field>
          </div>
          <Field label="Fecha de nacimiento">
            <input required type="date" className={inp} value={f.date_of_birth} onChange={set("date_of_birth")}/>
            {age !== null && (
              <span className={`block text-xs mt-1 ${underage ? "text-no-500" : "text-ink-500"}`}>
                {underage ? `Debes ser mayor de 18 años (tenés ${age}).` : `Edad: ${age} años ✓`}
              </span>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de documento">
              <select className={inp} value={f.document_type} onChange={set("document_type")}>
                <option value="CEDULA">Cédula de identidad</option>
                <option value="PASSPORT">Pasaporte</option>
              </select>
            </Field>
            <Field label="País emisor">
              <select className={inp} value={f.country} onChange={set("country")}>
                {COUNTRIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Número de documento"><input required className={inp} value={f.id_number} onChange={set("id_number")}/></Field>
          <Field label="Teléfono"><input required type="tel" className={inp} value={f.phone} onChange={set("phone")} placeholder="0981 123 456"/></Field>
          <Field label="Dirección"><input required className={inp} value={f.address} onChange={set("address")}/></Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-accent-500 mb-2">Cuenta</legend>
          <Field label="Correo electrónico"><input required type="email" className={inp} value={f.email} onChange={set("email")}/></Field>
          <Field label="Nombre de usuario (público)">
            <input required pattern="[a-zA-Z0-9_]{2,40}" className={inp} value={f.handle} onChange={set("handle")}/>
            <span className="block text-xs mt-1 text-ink-500">Así te verán los demás. Letras, números y guion bajo.</span>
          </Field>
          <Field label="Contraseña (6+ caracteres)"><input required type="password" minLength={6} className={inp} value={f.password} onChange={set("password")}/></Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wider text-accent-500 mb-2">Documentos</legend>
          <DocInput label="Frente de la cédula" file={docs.FRONT} onFile={(file) => setDocs({ ...docs, FRONT: file })}/>
          <DocInput label="Dorso de la cédula" file={docs.BACK} onFile={(file) => setDocs({ ...docs, BACK: file })}/>
          <DocInput label="Selfie sosteniendo la cédula" file={docs.SELFIE} onFile={(file) => setDocs({ ...docs, SELFIE: file })}/>
          <p className="text-xs text-ink-500">Formatos: JPG, PNG, WEBP o PDF. Máx. 8 MB por archivo.</p>
        </fieldset>

        <label className="flex items-start gap-2.5 text-xs text-ink-600 dark:text-ink-300 leading-relaxed">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5"/>
          <span>Confirmo que los datos y documentos son verídicos y míos, que soy mayor de 18 años, y autorizo el tratamiento de mis datos para la verificación de identidad conforme a la política de privacidad.</span>
        </label>

        {err && <div className="text-sm rounded-md px-3 py-2 bg-no-500/10 text-no-500">{err}</div>}

        <button disabled={busy || !accepted || underage} type="submit"
                className="w-full h-11 rounded-lg bg-ink-900 text-white dark:bg-white dark:text-ink-900 font-medium disabled:opacity-50">
          {busy ? (step || "Enviando...") : "Crear cuenta y enviar a revisión"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-500 dark:text-ink-400">
        ¿Ya tenés cuenta? <Link href="/login" className="text-accent-500 hover:underline">Ingresar</Link>
      </p>
    </div>
  );
}

const inp = "w-full h-10 px-3 rounded-lg border border-ink-200 dark:border-ink-800 bg-transparent text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">{label}</span>{children}</label>;
}

function DocInput({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-ink-300 dark:border-ink-700 px-3 py-2.5 cursor-pointer hover:border-accent-500">
      <div className="text-sm">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-ink-500 truncate max-w-[220px]">{file ? file.name : "Tocar para elegir archivo"}</div>
      </div>
      <span className={`text-xs px-2 py-1 rounded-md ${file ? "bg-yes-500/10 text-yes-500" : "bg-ink-100 dark:bg-ink-800 text-ink-500"}`}>
        {file ? "listo ✓" : "subir"}
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
             onChange={(e) => onFile(e.target.files?.[0] ?? null)}/>
    </label>
  );
}
