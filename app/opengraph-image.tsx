import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Rezerve — İşletmeniz için online randevu";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: "#0c1210",
        color: "#f3eee4",
        padding: "80px 88px",
        fontFamily: "Georgia, serif",
      }}
    >
      <div
        style={{
          fontSize: 26,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: "#d4b070",
          display: "flex",
        }}
      >
        Rezerve
      </div>
      <div
        style={{
          fontSize: 82,
          lineHeight: 1.05,
          marginTop: 28,
          maxWidth: 900,
          display: "flex",
        }}
      >
        Müşterileriniz kendi randevusunu alsın.
      </div>
      <div
        style={{
          fontSize: 30,
          color: "#97a698",
          marginTop: 34,
          display: "flex",
        }}
      >
        Kuaförden estetik merkezine — kendi randevu sayfanız, 5 dakikada.
      </div>
      <div
        style={{
          marginTop: 52,
          height: 1,
          width: 260,
          background: "#d4b070",
          display: "flex",
        }}
      />
    </div>,
    { ...size }
  );
}
