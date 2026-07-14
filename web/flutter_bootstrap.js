{{flutter_js}}
{{flutter_build_config}}

// Keep the rendering engine on the same origin as the app. Flutter includes
// these files in every web build, so loading them locally avoids a third-party
// runtime request and lets the production Content Security Policy stay strict.
_flutter.loader.load({
  serviceWorkerSettings: {
    serviceWorkerVersion: {{flutter_service_worker_version}},
  },
  config: {
    canvasKitBaseUrl: "canvaskit/",
  },
});
