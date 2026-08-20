import { Config } from "@remotion/cli/config";

// Applies to the studio and the `remotion` CLI. The rendering the marketing
// autopilot depends on goes through tool/render_social_video.mjs, which sets
// the same options on the programmatic API.
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(23);
Config.setOverwriteOutput(true);
Config.setPublicDir("public");
