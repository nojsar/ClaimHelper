import { loadFont } from "@remotion/fonts";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { MONO, SANS, SERIF } from "./brand";

/**
 * The same self-hosted faces the site and the OG cards use. Nothing is fetched
 * from a font CDN — see the self-hosted-assets rule in the privacy pass.
 * Files come from assets/fonts via tool/social_video.mjs --sync.
 */
const faces = [
  { family: SERIF, file: "Fraunces72pt-Bold.ttf", weight: "700" },
  { family: SANS, file: "IBMPlexSans-Regular.ttf", weight: "400" },
  { family: SANS, file: "IBMPlexSans-Bold.ttf", weight: "700" },
  { family: MONO, file: "IBMPlexMono-SemiBold.ttf", weight: "600" },
];

const handle = delayRender("Loading the brand fonts");

Promise.all(
  faces.map((face) =>
    loadFont({ family: face.family, url: staticFile(`fonts/${face.file}`), weight: face.weight }),
  ),
).then(
  () => continueRender(handle),
  (error) => cancelRender(error),
);
