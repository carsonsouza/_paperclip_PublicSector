import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { resolvePreviewRoute } from "./run-stn-import-dry-run.mjs";
import { resolveApplyRoute } from "./run-stn-import-apply.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_REQUEST = path.join(REPO_ROOT, "report", "stn", "stn-import-request-pilot.json");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, "report", "stn");
const DEFAULT_API_BASE = "http://127.0.0.1:3000";

export function requireApplyConfirmation({ apply, yes }) {
  if (apply && !yes) {
    throw new Error("Apply requer --yes no smoke onboarding.");
  }
}

export function buildRequestBodyForTarget(requestBody, targetCompanyId) {
  if (!targetCompanyId) return requestBody;
  return {
    ...requestBody,
    target: {
      mode: "existing_company",
      companyId: targetCompanyId,
    },
  };
}

async function postJson(apiBase, route, body) {
  const response = await fetch(`${apiBase}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) ${route}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function parseArgs(argv) {
  const options = {
    request: DEFAULT_REQUEST,
    outputDir: DEFAULT_OUTPUT_DIR,
    apiBase: DEFAULT_API_BASE,
    targetCompanyId: null,
    apply: false,
    yes: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--request" || arg === "--output-dir" || arg === "--api-base" || arg === "--target-company-id") && argv[i + 1]) {
      const key = arg.replace(/^--/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (arg === "--api-base" || arg === "--target-company-id") {
        options[key] = String(argv[i + 1]).trim();
      } else {
        options[key] = path.resolve(argv[i + 1]);
      }
      i += 1;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") options.help = true;
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage: node scripts/run-stn-onboarding-smoke.mjs [options]",
    "",
    "Options:",
    "  --request <path>",
    "  --output-dir <path>",
    "  --api-base <url>",
    "  --target-company-id <id>",
    "  --apply",
    "  --yes",
    "",
    `Defaults:`,
    `  request:    ${DEFAULT_REQUEST}`,
    `  output-dir: ${DEFAULT_OUTPUT_DIR}`,
    `  api-base:   ${DEFAULT_API_BASE}`,
    "",
  ].join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  requireApplyConfirmation(args);

  const requestBodyRaw = JSON.parse(await readFile(args.request, "utf8"));
  const requestBody = buildRequestBodyForTarget(requestBodyRaw, args.targetCompanyId);
  const targetMode = requestBody?.target?.mode ?? "new_company";
  const targetCompanyId = requestBody?.target?.companyId ?? null;
  const previewRoute = resolvePreviewRoute(targetMode, targetCompanyId);
  const applyRoute = resolveApplyRoute(targetMode, targetCompanyId);

  const previewResult = await postJson(args.apiBase, previewRoute, requestBody);
  await mkdir(args.outputDir, { recursive: true });
  const previewPath = path.join(args.outputDir, "stn-import-preview-result.json");
  await writeFile(previewPath, `${JSON.stringify(previewResult, null, 2)}\n`, "utf8");

  let applyPath = null;
  if (args.apply) {
    const applyResult = await postJson(args.apiBase, applyRoute, requestBody);
    applyPath = path.join(args.outputDir, "stn-import-apply-result.json");
    await writeFile(applyPath, `${JSON.stringify(applyResult, null, 2)}\n`, "utf8");
  }

  process.stdout.write([
    `Preview salvo em: ${previewPath}`,
    args.apply ? `Apply salvo em: ${applyPath}` : "Apply não executado (use --apply --yes).",
    `API base: ${args.apiBase}`,
    "",
  ].join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
