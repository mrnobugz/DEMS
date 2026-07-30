type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

export function DemstaLogo({ size = 40, withWordmark = false, className = "" }: LogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src="/logo.png"
        alt="DEMSTA logo"
        width={size}
        height={size}
        className="rounded-xl shadow-[0_8px_24px_rgba(11,95,255,0.25)]"
        style={{ width: size, height: size, objectFit: "cover" }}
      />
      {withWordmark && (
        <div className="leading-tight">
          <div className="font-display text-xl tracking-tight text-brand-700" style={{ fontWeight: 800 }}>
            DEMSTA
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Dental Care OS
          </div>
        </div>
      )}
    </div>
  );
}
