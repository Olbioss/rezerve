import { cn } from "@/lib/utils";

const STEPS = ["Hizmet", "Gün & saat", "Bilgiler"] as const;

/** Three-step progress rail for the booking flow. */
export function StepDots({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      {STEPS.map((label, i) => {
        const step = i + 1;
        return (
          <span key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "h-px w-8 transition-colors duration-300",
                step <= current ? "bg-brand" : "bg-border"
              )}
            />
            <span
              className={cn(
                "eyebrow transition-colors duration-300",
                step === current
                  ? "text-brand-ink"
                  : step < current
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              )}
            >
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
