import { ImageResponse } from "next/og";
import {
  BRAND_IMAGE_HEADERS,
  brandImageFonts,
  CHAMPAGNE,
  IVORY,
  MUTED,
  NIGHT,
} from "@/lib/brand/image-fonts";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Rezerve — İşletmeniz için online randevu";

/** The landing page's first screen, as a card: same words, same type. */
export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: NIGHT,
        color: IVORY,
        padding: "80px 88px",
        fontFamily: "Bodoni Moda",
      }}
    >
      <div style={{ display: "flex", fontSize: 44, letterSpacing: -0.5 }}>
        Rezer
        <span style={{ fontStyle: "italic", color: CHAMPAGNE }}>ve</span>
      </div>
      {/* Two set lines rather than wrapping: the renderer lays an inline
          italic out as its own box, which stranded "alsın." on a third line. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 84,
          lineHeight: 1.04,
          letterSpacing: -1,
          marginTop: 30,
        }}
      >
        <div style={{ display: "flex" }}>Müşterileriniz kendi</div>
        <div style={{ display: "flex", gap: 22 }}>
          randevusunu
          <span style={{ fontStyle: "italic", color: CHAMPAGNE }}>alsın.</span>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "Hanken Grotesk",
          fontSize: 30,
          color: MUTED,
          marginTop: 36,
        }}
      >
        Kuaförden estetik merkezine — kendi randevu sayfanız, 5 dakikada.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 52,
          height: 1,
          width: 260,
          background: CHAMPAGNE,
        }}
      />
    </div>,
    {
      ...size,
      fonts: [...(await brandImageFonts())],
      headers: BRAND_IMAGE_HEADERS,
    }
  );
}
