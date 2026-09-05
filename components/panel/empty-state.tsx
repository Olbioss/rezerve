/** Dashed-hairline placeholder used wherever a list has nothing in it yet. */
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-hair border-dashed px-6 py-10 text-center">
      <p className="font-display text-2xl italic">{title}</p>
      {children && (
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground text-sm">
          {children}
        </p>
      )}
    </div>
  );
}
