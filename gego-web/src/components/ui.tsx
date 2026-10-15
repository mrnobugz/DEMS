import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function SectionHeading({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="kicker">{kicker}</p>
      <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">{title}</h2>
      {text ? <p className="muted mt-3">{text}</p> : null}
    </div>
  );
}

export function PageHero({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <section
      className="bg-ink bg-cover bg-center text-white"
      style={{
        backgroundImage: "linear-gradient(rgba(9,30,62,0.82), rgba(9,30,62,0.78)), url(/img/carousel-2.jpg)",
      }}
    >
      <div className="wrap py-16 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-100">{kicker}</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-sky-50">{text}</p>
      </div>
    </section>
  );
}

export function TextField({ label, hint, ...props }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input" {...props} />
      {hint ? <span className="muted mt-1 block text-sm">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="select" {...props}>
        {children}
      </select>
    </label>
  );
}

export function TextAreaField({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <textarea className="textarea" {...props} />
    </label>
  );
}

export function FormBanner({ message, tone }: { message: string; tone: "ok" | "err" }) {
  if (!message) return null;
  return (
    <p role="status" aria-live="polite" className={tone === "ok" ? "banner-ok" : "banner-err"}>
      {message}
    </p>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-sky-300 bg-mist px-6 py-10 text-center">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="muted mt-2 text-sm">{text}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
