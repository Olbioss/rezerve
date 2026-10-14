import { z } from "zod";

/**
 * The assistant's tools as schemas — the contract between Rezerve and the
 * rezerve-asistan service. /api/mcp registers them, `bun run mcp:schema`
 * prints them as JSON Schema for the other repository's contract test, and
 * the tool functions return exactly these shapes.
 *
 * No tool takes a business or a customer: those arrive as headers the
 * assistant sets (lib/assistant/request-auth.ts), never as arguments the
 * model writes. Field names are snake_case, as MCP tools conventionally are.
 */

/** A business-local calendar date, "2026-10-17". */
const localDate = z.iso.date();
/** A business-local wall-clock time, "15:30". */
const wallTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** An instant — accepted with an offset as well as in UTC. */
const instant = z.iso.datetime({ offset: true });
/** A booking id as the model may pass it back; a bad one is "not found". */
const bookingId = z.string().max(64);

const businessInfo = z.object({
  name: z.string(),
  timezone: z.string(),
  today: localDate,
  now_local: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  description: z.string().nullable(),
  assistant_notes: z.string().nullable(),
  booking_window_days: z.number().int(),
  min_lead_time_minutes: z.number().int(),
  refund_notice_hours: z.number().int(),
  booking_page_url: z.url().nullable(),
});

const serviceInfo = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number().int(),
  price_cents: z.number().int(),
  deposit_cents: z.number().int().nullable(),
  currency: z.string(),
});

const slot = z.object({ starts_at: instant, local_label: z.string() });

const bookingView = z.object({
  id: z.uuid(),
  service_name: z.string(),
  starts_at: instant,
  local_label: z.string(),
  status: z.enum(["pending", "confirmed", "cancelled"]),
  deposit_cents: z.number().int().nullable(),
  paid: z.boolean(),
  hold_expires_at: instant.nullable(),
  cancelled_at: instant.nullable(),
  cancelled_by: z.enum(["owner", "customer"]).nullable(),
});

const findSlotsInput = z.object({
  service_id: z.uuid(),
  from_date: localDate,
  to_date: localDate,
  earliest_time: wallTime.optional(),
  latest_time: wallTime.optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

export const READ_TOOLS = {
  get_business_info: {
    title: "İşletme bilgisi",
    description:
      "The business's name, contact details, the owner's notes, its timezone with today's date there, its booking window and the kapora refund rule. Call it before talking about dates.",
    input: z.object({}),
    output: businessInfo,
    annotations: READ_ONLY,
  },
  list_services: {
    title: "Hizmetler",
    description:
      "Active services with duration and price. deposit_cents is the kapora that will actually be collected, or null for none.",
    input: z.object({}),
    output: z.object({ services: z.array(serviceInfo) }),
    annotations: READ_ONLY,
  },
  find_slots: {
    title: "Boş saatler",
    description:
      "Free start times for one service between two business-local dates (at most 14 days), optionally between two wall-clock times. Returns at most `limit` (default 10); truncated is true when there were more.",
    input: findSlotsInput,
    output: z.object({ slots: z.array(slot), truncated: z.boolean() }),
    annotations: READ_ONLY,
  },
  list_my_bookings: {
    title: "Randevularım",
    description:
      "This customer's upcoming bookings: confirmed, and holds still waiting for their kapora.",
    input: z.object({}),
    output: z.object({ bookings: z.array(bookingView) }),
    annotations: READ_ONLY,
  },
  get_booking: {
    title: "Randevu",
    description:
      "One of this customer's bookings by id — for example to see whether its kapora has been paid.",
    input: z.object({ booking_id: bookingId }),
    output: bookingView,
    annotations: READ_ONLY,
  },
};

export type BusinessInfo = z.infer<typeof businessInfo>;
export type ServiceInfo = z.infer<typeof serviceInfo>;
export type Slot = z.infer<typeof slot>;
export type BookingView = z.infer<typeof bookingView>;
export type ListServicesOutput = z.infer<
  typeof READ_TOOLS.list_services.output
>;
export type FindSlotsInput = z.infer<typeof findSlotsInput>;
export type FindSlotsOutput = z.infer<typeof READ_TOOLS.find_slots.output>;
export type ListMyBookingsOutput = z.infer<
  typeof READ_TOOLS.list_my_bookings.output
>;
export type GetBookingInput = z.infer<typeof READ_TOOLS.get_booking.input>;

const createBookingInput = z.object({
  service_id: z.uuid(),
  starts_at: instant,
  customer_name: z.string().min(2).max(80),
  // Checked in the tool with the booking form's own phone rule.
  customer_phone: z.string().max(32).nullish(),
  customer_email: z.email().nullish(),
  expect_deposit_cents: z.number().int().positive().nullish(),
});

const rescheduleBookingInput = z.object({
  booking_id: bookingId,
  new_starts_at: instant,
});

const cancelBookingInput = z.object({
  booking_id: bookingId,
  expect_refund: z.boolean().optional(),
});

export const WRITE_TOOLS = {
  create_booking: {
    title: "Randevu oluştur",
    description:
      "Book a slot for this customer — only after they confirmed the exact service, time and kapora. With a kapora the slot is held for 30 minutes and checkout_url is the payment page to send them; customer_email is then required. Pass expect_deposit_cents as the kapora you showed them (null for none): if it changed since, nothing is booked (terms_changed).",
    input: createBookingInput,
    output: z.object({
      booking_id: z.uuid(),
      status: z.enum(["confirmed", "pending"]),
      starts_at: instant,
      local_label: z.string(),
      checkout_url: z.url().nullable(),
      hold_expires_at: instant.nullable(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  reschedule_booking: {
    title: "Randevuyu taşı",
    description:
      "Move one of this customer's confirmed bookings to another free start time (from find_slots), keeping its length. A booking still waiting for its kapora cannot be moved, nor a paid one inside its last 24 hours (move_window_closed) — hand the customer to the business then.",
    input: rescheduleBookingInput,
    output: z.object({
      booking_id: z.uuid(),
      starts_at: instant,
      local_label: z.string(),
      previous_local_label: z.string(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  cancel_booking: {
    title: "Randevuyu iptal et",
    description:
      "Cancel one of this customer's bookings. With at least 24 hours' notice a paid kapora is refunded; later, the business keeps it. Pass expect_refund as what you told them: if that is no longer true, nothing is cancelled (refund_window_closed).",
    input: cancelBookingInput,
    output: z.object({
      cancelled: z.literal(true),
      deposit_refunded: z.boolean(),
      deposit_kept: z.boolean(),
      refund_failed: z.boolean(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
};

/** Every tool /api/mcp serves, read and write. */
export const TOOL_DEFINITIONS = { ...READ_TOOLS, ...WRITE_TOOLS };

export type CreateBookingInput = z.infer<typeof createBookingInput>;
export type CreateBookingOutput = z.infer<
  typeof WRITE_TOOLS.create_booking.output
>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingInput>;
export type RescheduleBookingOutput = z.infer<
  typeof WRITE_TOOLS.reschedule_booking.output
>;
export type CancelBookingInput = z.infer<typeof cancelBookingInput>;
export type CancelBookingOutput = z.infer<
  typeof WRITE_TOOLS.cancel_booking.output
>;
