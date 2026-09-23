/**
 * Fails if a deployed function could not construct the iyzico SDK.
 *
 * iyzipay loads its resources with readdirSync and a computed require, which
 * output tracing cannot follow; an import in lib/payments/iyzico.ts is what
 * gets them traced. Nothing else notices when that stops working — locally
 * node_modules is always complete — and the first sign in production was
 * every payment failing with ENOENT on lib/resources.
 *
 * For every server trace that includes the SDK, this copies exactly the traced
 * node_modules files into an empty directory, which is what a Vercel function
 * receives, and constructs the SDK there under Node.
 *
 *   bun run build && bun run check:trace
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const nodeModules = join(root, "node_modules");
const sdkEntry = join(nodeModules, "iyzipay", "lib", "Iyzipay.js");
const expected = readdirSync(
  join(nodeModules, "iyzipay", "lib", "resources")
).filter((name) => name.endsWith(".js")).length;

// Construct the SDK and count the resources it attached to itself.
const probe = `
const Iyzipay = require("./node_modules/iyzipay");
const sdk = new Iyzipay({ apiKey: "x", secretKey: "x", uri: "https://sandbox-api.iyzipay.com" });
process.stdout.write(String(Object.keys(sdk).filter((key) => !key.startsWith("_")).length));
`;

function* traceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* traceFiles(path);
    else if (entry.name.endsWith(".nft.json")) yield path;
  }
}

// Routes that trace the SDK mostly share one node_modules set; check each
// distinct set once.
const sets = new Map<string, { files: string[]; routes: string[] }>();
for (const trace of traceFiles(join(root, ".next", "server"))) {
  const { files } = JSON.parse(readFileSync(trace, "utf8")) as {
    files: string[];
  };
  const traced = files
    .map((file) => resolve(dirname(trace), file))
    .filter((file) => file.startsWith(`${nodeModules}/`))
    .sort();
  if (!traced.includes(sdkEntry)) continue;

  const key = traced.join("\n");
  const set = sets.get(key) ?? { files: traced, routes: [] };
  set.routes.push(relative(join(root, ".next", "server"), trace));
  sets.set(key, set);
}

if (sets.size === 0) {
  console.error(
    "✗ No server trace includes the iyzico SDK. Run `bun run build` first; if it has run, the SDK is no longer where this check looks."
  );
  process.exit(1);
}

let failed = false;
for (const { files, routes } of sets.values()) {
  const sandbox = mkdtempSync(join(tmpdir(), "rezerve-trace-"));
  try {
    for (const file of files) {
      if (!lstatSync(file).isFile()) continue;
      const target = join(sandbox, relative(root, file));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(file, target);
    }
    const loaded = Number(
      execFileSync("node", ["-e", probe], {
        cwd: sandbox,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
    if (loaded === expected) {
      console.log(
        `✓ ${loaded}/${expected} iyzico resources load for ${routes.length} route(s)`
      );
    } else {
      failed = true;
      console.error(
        `✗ ${loaded}/${expected} iyzico resources load for:\n  ${routes.join("\n  ")}`
      );
    }
  } catch (error) {
    failed = true;
    const stderr = (error as { stderr?: string }).stderr ?? "";
    const detail =
      stderr.split("\n").find((line) => /^\w*Error\b/.test(line)) ??
      (stderr || String(error));
    console.error(
      `✗ The iyzico SDK cannot load from its trace for:\n  ${routes.join("\n  ")}\n  ${detail}`
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

process.exit(failed ? 1 : 0);
