import { loadFont } from "@remotion/fonts";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { MONO, SANS, SERIF } from "./brand";

/**
 * The same self-hosted faces the site serves. Nothing is fetched from a font
 * CDN — see the self-hosted-assets rule from the privacy pass. Files arrive via
 * tool/social_video.mjs --sync.
 *
 * Tinos stands in for Times New Roman here: Times New Roman is proprietary and
 * cannot be redistributed, and Tinos is metrically identical, so a rendered card
 * matches what a visitor with Times New Roman installed sees on the page.
 */
const fixedFaces = [
  { family: SERIF, file: "Tinos-Bold.ttf", weight: "700" },
  { family: MONO, file: "IBMPlexMono-SemiBold.ttf", weight: "600" },
];

const handle = delayRender("Loading the brand fonts");

/**
 * Inter ships as a single variable file, so it is declared once across the whole
 * weight range instead of as separate faces — otherwise every weight would
 * render at whichever fixed value the face was registered with.
 */
async function loadVariableSans(): Promise<void> {
  const face = new FontFace(SANS, `url(${staticFile("fonts/inter-var.woff2")})`, {
    weight: "100 900",
    style: "normal",
    display: "block",
  });
  const loaded = await face.load();
  document.fonts.add(loaded);
}

Promise.all([
  loadVariableSans(),
  ...fixedFaces.map((face) =>
    loadFont({ family: face.family, url: staticFile(`fonts/${face.file}`), weight: face.weight }),
  ),
]).then(
  () => continueRender(handle),
  (error) => cancelRender(error),
);
