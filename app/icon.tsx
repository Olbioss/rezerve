import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0c1210",
        color: "#d4b070",
        fontSize: 22,
        fontFamily: "Georgia, serif",
        fontStyle: "italic",
        borderRadius: 6,
      }}
    >
      R
    </div>,
    { ...size }
  );
}
