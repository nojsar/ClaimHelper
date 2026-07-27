import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const index = readFileSync(path.join(projectRoot, "web", "index.html"), "utf8");
const headScript = index.match(
  /<script>\s*\/\/ Deep links \(Stripe returns[\s\S]*?<\/script>/,
)?.[0]
  .replace(/^<script>/, "")
  .replace(/<\/script>$/, "");

assert.ok(headScript, "Could not find the landing-page deep-link bootstrap.");
assert.match(
  index,
  /typeof window\.__isSecureEmailSignInAction === 'function'[\s\S]*bootApp\(\)/,
  "The app loader must boot valid passwordless action URLs without replacing their query.",
);

function runHead(url) {
  const parsed = new URL(url);
  const classes = new Set();
  const context = {
    URL,
    URLSearchParams,
    location: {
      origin: parsed.origin,
      search: parsed.search,
      hash: parsed.hash,
    },
    document: {
      documentElement: {
        classList: {
          add(name) {
            classes.add(name);
          },
        },
      },
    },
    window: {},
  };
  vm.runInNewContext(headScript, context);
  return { classes, isEmailAction: context.window.__isSecureEmailSignInAction };
}

test("valid same-origin Firebase sign-in action enters app mode", () => {
  const continuation = encodeURIComponent(
    "https://getmyyes.com/#/email-link?caseId=case-1&resumeCheckout=packet",
  );
  const result = runHead(
    `https://getmyyes.com/?mode=signIn&oobCode=secret&continueUrl=${continuation}`,
  );
  assert.equal(result.isEmailAction(), true);
  assert.equal(result.classes.has("app-mode"), true);
});

test("ordinary and malformed action URLs stay on the landing page", () => {
  for (const url of [
    "https://getmyyes.com/",
    "https://getmyyes.com/?mode=signIn&continueUrl=https%3A%2F%2Fgetmyyes.com%2F%23%2Femail-link",
    "https://getmyyes.com/?mode=resetPassword&oobCode=secret&continueUrl=https%3A%2F%2Fgetmyyes.com%2F%23%2Femail-link",
    "https://getmyyes.com/?mode=signIn&oobCode=secret&continueUrl=https%3A%2F%2Fevil.example%2F%23%2Femail-link",
    "https://getmyyes.com/?mode=signIn&oobCode=secret&continueUrl=https%3A%2F%2Fgetmyyes.com%2F%23%2Fstats",
  ]) {
    const result = runHead(url);
    assert.equal(result.isEmailAction(), false, url);
    assert.equal(result.classes.has("app-mode"), false, url);
  }
});

test("ordinary hash app routes still enter app mode", () => {
  const result = runHead("https://getmyyes.com/#/upload");
  assert.equal(result.classes.has("app-mode"), true);
});
