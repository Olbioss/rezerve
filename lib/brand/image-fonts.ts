import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The brand's type for generated images — the favicon, the Apple touch icon
 * and the social card.
 *
 * The site gets Bodoni Moda and Hanken Grotesk from next/font, but the image
 * renderer has no fonts at all: these files used to ask for "Georgia", which
 * does not exist there, so every image quietly came out in the renderer's
 * built-in sans. It only reads TTF, OTF or WOFF, never the site's WOFF2, so
 * the three cuts it needs sit in assets/fonts — Bodoni at its 96pt optical
 * size, the high-contrast cut the headings use. Both families are SIL OFL
 * 1.1; the licences are beside them.
 *
 * The site's images are rendered once, at build time. A business's own
 * card (app/r/[slug]/opengraph-image.tsx) is rendered per request, so these
 * files must also reach the deployed function; output tracing follows the
 * process.cwd() paths below, as in Next's own example.
 */
export async function brandImageFonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [bodoni, bodoniItalic, hanken] = await Promise.all([
    readFile(join(dir, "BodoniModa-Regular.ttf")),
    readFile(join(dir, "BodoniModa-Italic.ttf")),
    readFile(join(dir, "HankenGrotesk-Regular.ttf")),
  ]);
  return [
    { name: "Bodoni Moda", data: bodoni, style: "normal", weight: 400 },
    { name: "Bodoni Moda", data: bodoniItalic, style: "italic", weight: 400 },
    { name: "Hanken Grotesk", data: hanken, style: "normal", weight: 400 },
  ] as const;
}

/**
 * For the 32px favicon only. At that size the display cut's hairlines are
 * thinner than a pixel and the R falls apart into strokes; Bodoni Moda's
 * 11pt optical size in bold keeps a hairline worth drawing.
 */
export async function faviconFont() {
  const data = await readFile(
    join(process.cwd(), "assets/fonts/BodoniModa-SmallBold.ttf")
  );
  return [
    { name: "Bodoni Moda Small", data, style: "normal", weight: 700 },
  ] as const;
}

/** The night ground and champagne of the Gece palette, as in the emails. */
export const NIGHT = "#0c1210";
export const CHAMPAGNE = "#d4b070";
export const IVORY = "#f3eee4";
export const MUTED = "#97a698";

/**
 * For the site's own images. Partial prerendering cannot build them at
 * build time — the image renderer reads its own files from disk, which ends
 * a prerender — so they are rendered on request, and this lets the CDN keep
 * each one for the life of the deployment instead. A deploy purges it.
 */
export const BRAND_IMAGE_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=31536000",
};
