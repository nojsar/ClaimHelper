import { Config } from "@remotion/cli/config";

// Applies to the studio and the `remotion` CLI. The rendering the marketing
// autopilot depends on goes through tool/render_social_video.mjs, which sets
// the same options on the programmatic API.
// PNG (not JPEG) intermediate frames: the content is flat vector-style title
// cards, not photography, so JPEG's chroma subsampling and ringing visibly
// blur text edges before h264 ever sees the frame. A low CRF then keeps that
// sharpness through encoding instead of quantizing it back out.
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(16);
Config.setOverwriteOutput(true);
Config.setPublicDir("public");
