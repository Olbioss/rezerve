import { requireOwner } from "@/lib/auth-guard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { session } = await requireOwner();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Welcome, {session.user.name}
        </h1>
        <p className="text-muted-foreground">
          Upcoming bookings will appear here.
        </p>
      </div>
    </div>
  );
}
