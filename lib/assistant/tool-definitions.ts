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
