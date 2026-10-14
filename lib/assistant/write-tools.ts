import "server-only";
import { revalidatePath } from "next/cache";
import { FALLBACK_IP } from "@/lib/booking/client-ip";
import { createBookingCore } from "@/lib/booking/create-booking-core";
import { customerCancelCore } from "@/lib/booking/customer-cancel-core";
import { customerRescheduleCore } from "@/lib/booking/customer-reschedule-core";
import { optionalPhoneSchema } from "@/lib/phone";
import { localLabel } from "./format";
import type { AssistantIdentity } from "./identity";
import type {
  CancelBookingInput,
  CancelBookingOutput,
  CreateBookingInput,
  CreateBookingOutput,
  RescheduleBookingInput,
  RescheduleBookingOutput,
} from "./tool-definitions";
import { type ToolResult, toolError } from "./tool-result";

/** The owner's panel lists bookings; a change made in chat must show there. */
function refreshPanel() {
  revalidatePath("/panel/randevular");
  revalidatePath("/panel");
}

export async function createBookingTool(
  { business, customerRef }: AssistantIdentity,
  args: CreateBookingInput
): Promise<ToolResult<CreateBookingOutput>> {
  const customerName = args.customer_name.trim();
  if (customerName.length < 2) {
    return toolError("invalid", "Müşteri adı en az 2 karakter olmalı");
  }
  // The booking form's own rule, so a chat booking stores a phone the same way.
  const phone = optionalPhoneSchema.safeParse(args.customer_phone ?? null);
  if (!phone.success) {
    return toolError(
      "invalid",
      phone.error.issues[0]?.message ?? "Geçerli bir telefon numarası girin"
    );
  }

  const result = await createBookingCore({
    business,
    serviceId: args.service_id,
    startsAt: new Date(args.starts_at),
    customerName,
    customerEmail: args.customer_email ?? null,
    customerPhone: phone.data,
    source: "assistant",
    customerRef,
    throttle: { customerRef },
    // The assistant calls from its own servers, never the customer's; iyzico
    // still wants a buyer IP, and this is the documented sandbox stand-in.
    customerIp: FALLBACK_IP,
    expectDepositCents: args.expect_deposit_cents,
  });
  if (!result.ok) return toolError(result.code, result.message);

  refreshPanel();
  const { booking } = result;
  return {
    ok: true,
    data: {
      booking_id: booking.id,
      status: booking.status === "pending" ? "pending" : "confirmed",
      starts_at: booking.startsAt.toISOString(),
      local_label: localLabel(booking.startsAt, business.profile.timezone),
      checkout_url: result.checkoutUrl ?? null,
      hold_expires_at: result.holdExpiresAt?.toISOString() ?? null,
    },
  };
}

export async function rescheduleBookingTool(
  { business, customerRef }: AssistantIdentity,
  args: RescheduleBookingInput
): Promise<ToolResult<RescheduleBookingOutput>> {
  const result = await customerRescheduleCore({
    business,
    bookingId: args.booking_id,
    customerRef,
    newStartsAt: new Date(args.new_starts_at),
  });
  if (!result.ok) return toolError(result.code, result.message);

  refreshPanel();
  const { timezone } = business.profile;
  return {
    ok: true,
    data: {
      booking_id: result.booking.id,
      starts_at: result.booking.startsAt.toISOString(),
      local_label: localLabel(result.booking.startsAt, timezone),
      previous_local_label: localLabel(result.previousStartsAt, timezone),
    },
  };
}

export async function cancelBookingTool(
  { business, customerRef }: AssistantIdentity,
  args: CancelBookingInput
): Promise<ToolResult<CancelBookingOutput>> {
  const result = await customerCancelCore({
    organizationId: business.organizationId,
    bookingId: args.booking_id,
    customerRef,
    expectRefund: args.expect_refund ?? false,
    customerIp: FALLBACK_IP,
  });
  if (!result.ok) return toolError(result.code, result.message);

  refreshPanel();
  return {
    ok: true,
    data: {
      cancelled: true,
      deposit_refunded: result.depositRefunded,
      deposit_kept: result.depositKept,
      refund_failed: result.refundFailed,
    },
  };
}
