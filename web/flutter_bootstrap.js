{{flutter_js}}
{{flutter_build_config}}

// Firebase email-link sign-in returns to `#/email-link`. Retain the original
// browser URL while Flutter initializes so the route can validate its action
// code without persisting any email address locally.
window.__getMyYesEmailLink = window.location.href;

// Keep the rendering engine on the same origin as the app. Flutter includes
// these files in every web build, so loading them locally avoids a third-party
// runtime request and lets the production Content Security Policy stay strict.
_flutter.loader.load({
  config: {
    canvasKitBaseUrl: "canvaskit/",
  },
});
