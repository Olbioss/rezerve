import { ImageResponse } from "next/og";
import {
  BRAND_IMAGE_HEADERS,
  brandImageFonts,
  CHAMPAGNE,
  NIGHT,
} from "@/lib/brand/image-fonts";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * The home-screen icon. iOS rounds the corners itself, so the ground runs to
 * the edge; the R is the favicon's, with room to show Bodoni's hairlines.
 */
export default async function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: NIGHT,
        color: CHAMPAGNE,
        fontFamily: "Bodoni Moda",
        fontSize: 132,
        lineHeight: 1,
        paddingTop: 10,
      }}
    >
      R
    </div>,
    {
      ...size,
      fonts: [...(await brandImageFonts())],
      headers: BRAND_IMAGE_HEADERS,
    }
  );
}
