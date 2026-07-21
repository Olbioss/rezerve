"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createService,
  deleteService,
  type ServiceInput,
  updateService,
} from "@/lib/actions/services";
import { formatMoney } from "@/lib/format";

type Service = ServiceInput & { id: string };

export function ServicesManager({
  services,
  currency,
}: {
  services: Service[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const deposit = form.get("deposit");
    const input: ServiceInput = {
      name: String(form.get("name")),
      description: String(form.get("description")) || null,
      durationMinutes: Number(form.get("duration")),
      priceCents: Math.round(Number(form.get("price")) * 100),
      depositCents: deposit ? Math.round(Number(deposit) * 100) || null : null,
      active: true,
    };
    if (editing) input.active = editing.active;
    startTransition(async () => {
      const result = editing
        ? await updateService(editing.id, input)
        : await createService(input);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Service updated" : "Service created");
      setOpen(false);
      setEditing(null);
    });
  }

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setOpen(true);
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Services</h1>
          <p className="text-muted-foreground">What your customers can book.</p>
        </div>
        <Button onClick={openNew}>Add service</Button>
      </div>

      {services.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No services yet. Add your first one to appear on your booking page.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Deposit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">{service.name}</TableCell>
                <TableCell>{service.durationMinutes} min</TableCell>
                <TableCell>
                  {formatMoney(service.priceCents, currency)}
                </TableCell>
                <TableCell>
                  {service.depositCents
                    ? formatMoney(service.depositCents, currency)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={service.active ? "default" : "secondary"}>
                    {service.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(service)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteService(service.id);
                        if (result?.error) toast.error(result.error);
                        else toast.success("Service deleted");
                      })
                    }
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit service" : "New service"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                minLength={2}
                defaultValue={editing?.name ?? ""}
                placeholder="Haircut"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                name="description"
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="duration">Duration (min)</Label>
                <Input
                  id="duration"
                  name="duration"
                  type="number"
                  required
                  min={5}
                  max={600}
                  step={5}
                  defaultValue={editing?.durationMinutes ?? 30}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  defaultValue={
                    editing ? (editing.priceCents / 100).toString() : ""
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deposit">Deposit (optional)</Label>
                <Input
                  id="deposit"
                  name="deposit"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={
                    editing?.depositCents
                      ? (editing.depositCents / 100).toString()
                      : ""
                  }
                />
              </div>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save service"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
