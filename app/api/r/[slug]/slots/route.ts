import { NextResponse } from "next/server";
import {
  getAvailableSlots,
  getBusinessBySlug,
} from "@/lib/booking/get-available-slots";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const serviceId = url.searchParams.get("serviceId");
  const date = url.searchParams.get("date");
  if (!serviceId || !date) {
    return NextResponse.json(
      { error: "serviceId and date are required" },
      { status: 400 }
    );
  }

  const business = await getBusinessBySlug(slug);
  if (!business) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const slots = await getAvailableSlots(business, serviceId, date);
  if (slots === null) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  return NextResponse.json({
    slots: slots.map((slot) => slot.toISOString()),
  });
}
