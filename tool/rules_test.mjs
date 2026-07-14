import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const windows = process.platform === "win32";

function spawnCli(command, args, options = {}) {
  if (!windows) return spawnSync(command, args, { ...options, shell: false });
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const line = [command, ...args.map(quote)].join(" ");
  return spawnSync(line, {
    ...options,
    shell: true,
  });
}

function javaMajor(command) {
  if (path.isAbsolute(command) && !existsSync(command)) return null;
  const result = spawnSync(command, ["-version"], {
    cwd: projectRoot,
    encoding: "utf8",
    shell: false,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = output.match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (!match || result.status !== 0) return null;
  return Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
}

const javaCandidates = [
  process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", windows ? "java.exe" : "java"),
  process.env.ProgramFiles && path.join(
    process.env.ProgramFiles,
    "Android",
    "Android Studio",
    "jbr",
    "bin",
    "java.exe",
  ),
  "java",
].filter(Boolean);

const javaCommand = javaCandidates.find((candidate) => (javaMajor(candidate) ?? 0) >= 21);
if (!javaCommand) {
  throw new Error("Firestore/Storage rule tests require Java 21 or newer. Set JAVA_HOME and retry.");
}

const env = { ...process.env };
if (path.isAbsolute(javaCommand)) {
  env.JAVA_HOME = path.dirname(path.dirname(javaCommand));
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = `${path.dirname(javaCommand)}${path.delimiter}${env[pathKey] ?? ""}`;
}

const emulatorArgs = [
  "emulators:exec",
  "--only",
  "firestore,storage",
  "--project",
  "claimhelper-rules-test",
  "npm --prefix functions run test:rules",
];
const firebaseCommand = "firebase";
const firebaseProbe = spawnCli(firebaseCommand, ["--version"], {
  cwd: projectRoot,
  env,
  encoding: "utf8",
});
const command = firebaseProbe.status === 0 ? firebaseCommand : "npx";
const args = firebaseProbe.status === 0
  ? emulatorArgs
  : ["--yes", "firebase-tools@15.23.0", ...emulatorArgs];

console.log(`[rules] Java ${javaMajor(javaCommand)} via ${javaCommand}`);
const result = spawnCli(command, args, {
  cwd: projectRoot,
  env,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Rules emulator suite failed with exit code ${result.status}.`);
}
