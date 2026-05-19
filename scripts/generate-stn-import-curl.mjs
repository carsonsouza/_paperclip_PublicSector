import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { applyImportRequestOverrides, resolvePreviewRoute } from "./run-stn-import-dry-run.mjs";

import { resolveApplyRoute } from "./run-stn-import-apply.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_REQUEST = path.join(REPO_ROOT, "report", "stn", "stn-import-request-pilot.json");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "report", "stn", "stn-import-curl-commands.ps1");
const DEFAULT_API_BASE = "http://127.0.0.1:3000";
const DEFAULT_AUTH_ENV_VAR = "PAPERCLIP_TOKEN";

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildCurlCommands({ apiBase, requestPath, targetMode, companyId, authEnvVar = DEFAULT_AUTH_ENV_VAR }) {
  const previewRoute = resolvePreviewRoute(targetMode, companyId);
  const applyRoute = resolveApplyRoute(targetMode, companyId);
  const base = apiBase.replace(/\/+$/, "");
  const request = path.resolve(requestPath);
  const authHeader = authEnvVar
    ? `  --header "Authorization: Bearer $env:${authEnvVar}" \\`
    : null;
  const previewLines = [
    "curl.exe --request POST \\",
    `  --url ${psQuote(`${base}${previewRoute}`)} \\`,
    "  --header 'content-type: application/json' \\",
  ];
  if (authHeader) previewLines.push(authHeader);
  previewLines.push(`  --data-binary ${psQuote(`@${request}`)}`);
  const applyLines = [
    "curl.exe --request POST \\",
    `  --url ${psQuote(`${base}${applyRoute}`)} \\`,
    "  --header 'content-type: application/json' \\",
  ];
  if (authHeader) applyLines.push(authHeader);
  applyLines.push(`  --data-binary ${psQuote(`@${request}`)}`);

  return {
    preview: previewLines.join("\n"),
    apply: applyLines.join("\n"),
  };
}

function parseArgs(argv) {
  const options = {
    request: DEFAULT_REQUEST,
    output: DEFAULT_OUTPUT,
    apiBase: DEFAULT_API_BASE,
    targetCompanyId: null,
    collisionStrategy: null,
    authEnvVar: DEFAULT_AUTH_ENV_VAR,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--request" || arg === "--output" || arg === "--api-base" || arg === "--target-company-id" || arg === "--auth-env-var") && argv[i + 1]) {
      const key = arg.replace(/^--/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (arg === "--api-base" || arg === "--target-company-id" || arg === "--auth-env-var") {
        options[key] = String(argv[i + 1]).trim();
      } else {
        options[key] = path.resolve(argv[i + 1]);
      }
      i += 1;
      continue;
    }
    if (arg === "--collision-strategy" && argv[i + 1]) {
      options.collisionStrategy = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === "--no-auth") {
      options.authEnvVar = null;
      continue;
    }
    if (arg === "--help" || arg === "-h") options.help = true;
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage: node scripts/generate-stn-import-curl.mjs [options]",
    "",
    "Options:",
    "  --request <path>",
    "  --output <path>",
    "  --api-base <url>",
    "  --target-company-id <id>",
    "  --collision-strategy <rename|skip>",
    "  --auth-env-var <name>",
    "  --no-auth",
    "",
    `Defaults:`,
    `  request:  ${DEFAULT_REQUEST}`,
    `  output:   ${DEFAULT_OUTPUT}`,
    `  api-base: ${DEFAULT_API_BASE}`,
    `  auth var: ${DEFAULT_AUTH_ENV_VAR}`,
    "",
  ].join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const requestBodyRaw = JSON.parse(await readFile(args.request, "utf8"));
  const requestBody = applyImportRequestOverrides(requestBodyRaw, {
    targetCompanyId: args.targetCompanyId,
    collisionStrategy: args.collisionStrategy,
  });
  const targetMode = requestBody?.target?.mode ?? "new_company";
  const targetCompanyId = requestBody?.target?.companyId ?? null;
  const commands = buildCurlCommands({
    apiBase: args.apiBase,
    requestPath: args.request,
    targetMode,
    companyId: targetCompanyId,
    authEnvVar: args.authEnvVar,
  });

  const generatedAt = process.env.STN_GENERATED_AT ?? new Date().toISOString();
  const script = [
    "# STN onboarding import commands",
    `# Generated at: ${generatedAt}`,
    args.authEnvVar
      ? `# Auth header uses PowerShell env var: $env:${args.authEnvVar}`
      : "# Auth header disabled (--no-auth)",
    `# Collision strategy: ${requestBody?.collisionStrategy ?? "default(server)"}`,
    "",
    "# Preview",
    commands.preview,
    "",
    "# Apply",
    commands.apply,
    "",
  ].join("\n");

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, script, "utf8");
  process.stdout.write([
    `Comandos curl gerados em: ${args.output}`,
    `Preview route mode: ${targetMode}`,
    "",
  ].join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
