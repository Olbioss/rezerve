/** One headline number on the panel overview. */
export function StatTile({
  label,
  value,
  suffix,
  detail,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl bg-card px-5 py-4 ring-1 ring-border">
      <p className="eyebrow text-muted-foreground">{label}</p>
      <p className="numeral mt-2 text-[3.375rem] leading-none">
        {value}
        {suffix && (
          <span className="ml-1 text-2xl text-muted-foreground">{suffix}</span>
        )}
      </p>
      {detail && <p className="mt-2 text-muted-foreground text-xs">{detail}</p>}
    </div>
  );
}
