/** Title, one line of context, and an optional action for a panel page. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl leading-none">{title}</h1>
        {description && (
          <p className="mt-3 text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
