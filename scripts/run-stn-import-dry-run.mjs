import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildAuthHeaders, DEFAULT_TOKEN_ENV_VAR } from "./stn-auth.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_REQUEST = path.join(REPO_ROOT, "report", "stn", "stn-import-request-pilot.json");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "report", "stn", "stn-import-preview-result.json");
const DEFAULT_API_BASE = "http://127.0.0.1:3000";

export function resolvePreviewRoute(targetMode, companyId) {
  if (targetMode === "existing_company") {
    if (!companyId) throw new Error("Target existing_company requer companyId.");
    return `/api/companies/${companyId}/imports/preview`;
  }
  return "/api/companies/import/preview";
}

function parseArgs(argv) {
  const options = {
    request: DEFAULT_REQUEST,
    output: DEFAULT_OUTPUT,
    apiBase: DEFAULT_API_BASE,
    targetCompanyId: null,
    token: null,
    tokenEnvVar: DEFAULT_TOKEN_ENV_VAR,
    noAuth: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--request" || arg === "--output" || arg === "--api-base" || arg === "--target-company-id" || arg === "--token" || arg === "--token-env-var") && argv[i + 1]) {
      const key = arg.replace(/^--/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (arg === "--api-base" || arg === "--target-company-id" || arg === "--token" || arg === "--token-env-var") {
        options[key] = String(argv[i + 1]).trim();
      } else {
        options[key] = path.resolve(argv[i + 1]);
      }
      i += 1;
      continue;
    }
    if (arg === "--no-auth") {
      options.noAuth = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") options.help = true;
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage: node scripts/run-stn-import-dry-run.mjs [options]",
    "",
    "Options:",
    "  --request <path>",
    "  --output <path>",
    "  --api-base <url>",
    "  --target-company-id <id>",
    "  --token <value>",
    "  --token-env-var <name>",
    "  --no-auth",
    "",
    `Defaults:`,
    `  request:  ${DEFAULT_REQUEST}`,
    `  output:   ${DEFAULT_OUTPUT}`,
    `  api-base: ${DEFAULT_API_BASE}`,
    `  token env: ${DEFAULT_TOKEN_ENV_VAR}`,
    "",
  ].join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const requestBody = JSON.parse(await readFile(args.request, "utf8"));
  if (args.targetCompanyId) {
    requestBody.target = {
      mode: "existing_company",
      companyId: args.targetCompanyId,
    };
  }
  const route = resolvePreviewRoute(requestBody?.target?.mode, requestBody?.target?.companyId ?? null);
  const authHeaders = buildAuthHeaders(args);
  const response = await fetch(`${args.apiBase}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(requestBody),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Preview falhou (${response.status}): ${text}`);
  }
  const json = text ? JSON.parse(text) : {};
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  process.stdout.write([
    `Preview salvo em: ${args.output}`,
    `API: ${args.apiBase}${route}`,
    "",
  ].join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
