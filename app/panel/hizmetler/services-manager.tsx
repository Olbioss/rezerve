"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/panel/empty-state";
import { PageHeader } from "@/components/panel/page-header";
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
      toast.success(editing ? "Hizmet güncellendi" : "Hizmet oluşturuldu");
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
    <div className="grid gap-8">
      <PageHeader
        title="Hizmetler"
        description="Müşterilerinizin randevu alabileceği hizmetler."
        action={
          <Button variant="brand" onClick={openNew}>
            Hizmet ekle
          </Button>
        }
      />

      {services.length === 0 ? (
        <EmptyState title="Henüz hizmet yok.">
          Randevu sayfanızda görünmesi için ilk hizmetinizi ekleyin.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ad</TableHead>
              <TableHead>Süre</TableHead>
              <TableHead>Fiyat</TableHead>
              <TableHead>Kapora</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium">
                  {service.name}
                  {service.description && (
                    <span className="block text-muted-foreground text-xs">
                      {service.description}
                    </span>
                  )}
                </TableCell>
                <TableCell className="numeral">
                  {service.durationMinutes} dk
                </TableCell>
                <TableCell className="numeral text-base">
                  {formatMoney(service.priceCents, currency)}
                </TableCell>
                <TableCell className="numeral">
                  {service.depositCents
                    ? formatMoney(service.depositCents, currency)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={service.active ? "default" : "ghost"}>
                    {service.active ? "Aktif" : "Pasif"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(service)}
                  >
                    Düzenle
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteService(service.id);
                        if (result?.error) toast.error(result.error);
                        else toast.success("Hizmet silindi");
                      })
                    }
                  >
                    Sil
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
              {editing ? "Hizmeti düzenle" : "Yeni hizmet"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Ad</Label>
              <Input
                id="name"
                name="name"
                required
                minLength={2}
                defaultValue={editing?.name ?? ""}
                placeholder="Saç kesimi"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description">Açıklama (isteğe bağlı)</Label>
              <Input
                id="description"
                name="description"
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="duration">Süre (dk)</Label>
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
              <div className="grid gap-1.5">
                <Label htmlFor="price">Fiyat</Label>
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
              <div className="grid gap-1.5">
                <Label htmlFor="deposit">Kapora</Label>
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
            <Button type="submit" variant="brand" disabled={pending}>
              {pending ? "Kaydediliyor…" : "Hizmeti kaydet"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
