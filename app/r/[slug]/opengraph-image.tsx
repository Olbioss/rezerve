import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getBusinessBySlug } from "@/lib/booking/get-available-slots";
import {
  brandImageFonts,
  CHAMPAGNE,
  IVORY,
  MUTED,
  NIGHT,
} from "@/lib/brand/image-fonts";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Rezerve üzerinde online randevu sayfası";

/** Bodoni at its display size is wide; long names step down to fit two lines. */
function nameSize(name: string): number {
  if (name.length <= 16) return 104;
  if (name.length <= 28) return 84;
  if (name.length <= 44) return 68;
  return 56;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The card a business's booking link previews with: its own name in the
 * brand's type, on the same night ground as the site's card. Rendered per
 * request, unlike the site's card, because every business has its own.
 */
export default async function BusinessCard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = await getBusinessBySlug(slug);
  if (!business) notFound();
  const name = business.orgName;
  const line = clip(
    business.profile.description ?? "Online randevu alın — üyelik gerekmez.",
    120
  );

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: NIGHT,
        color: IVORY,
        padding: "72px 88px",
        fontFamily: "Bodoni Moda",
      }}
    >
      <div
        style={{
          display: "flex",
          fontFamily: "Hanken Grotesk",
          fontSize: 26,
          letterSpacing: 1,
          color: CHAMPAGNE,
        }}
      >
        Online randevu
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: nameSize(name),
            lineHeight: 1.04,
            letterSpacing: -1,
          }}
        >
          {name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 34,
            height: 1,
            width: 220,
            background: CHAMPAGNE,
          }}
        />
        <div
          style={{
            display: "flex",
            marginTop: 30,
            maxWidth: 940,
            fontFamily: "Hanken Grotesk",
            fontSize: 30,
            lineHeight: 1.35,
            color: MUTED,
          }}
        >
          {line}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 36, letterSpacing: -0.5 }}>
        Rezer
        <span style={{ fontStyle: "italic", color: CHAMPAGNE }}>ve</span>
      </div>
    </div>,
    { ...size, fonts: [...(await brandImageFonts())] }
  );
}
