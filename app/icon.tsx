import { ImageResponse } from "next/og";
import {
  BRAND_IMAGE_HEADERS,
  CHAMPAGNE,
  faviconFont,
  NIGHT,
} from "@/lib/brand/image-fonts";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * The Bodoni R of the wordmark, champagne on the night ground — cut for small
 * sizes, since the display R the Apple icon uses breaks up at 32px.
 */
export default async function Icon() {
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
        fontFamily: "Bodoni Moda Small",
        fontWeight: 700,
        fontSize: 26,
        lineHeight: 1,
        borderRadius: 7,
        // Bodoni's R sits a little high in its box; this centres the ink.
        paddingTop: 2,
      }}
    >
      R
    </div>,
    {
      ...size,
      fonts: [...(await faviconFont())],
      headers: BRAND_IMAGE_HEADERS,
    }
  );
}
