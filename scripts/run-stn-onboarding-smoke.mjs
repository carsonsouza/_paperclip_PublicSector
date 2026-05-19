import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildAuthHeaders, DEFAULT_TOKEN_ENV_VAR } from "./stn-auth.mjs";

import { applyImportRequestOverrides, resolvePreviewRoute } from "./run-stn-import-dry-run.mjs";
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
  return applyImportRequestOverrides(requestBody, { targetCompanyId });
}

export function summarizePreviewPlan(previewResult) {
  const agentPlans = Array.isArray(previewResult?.plan?.agentPlans) ? previewResult.plan.agentPlans : [];
  const projectPlans = Array.isArray(previewResult?.plan?.projectPlans) ? previewResult.plan.projectPlans : [];
  const issuePlans = Array.isArray(previewResult?.plan?.issuePlans) ? previewResult.plan.issuePlans : [];

  const countByAction = (items) => items.reduce((acc, item) => {
    const action = item?.action;
    if (!action) return acc;
    acc[action] = (acc[action] ?? 0) + 1;
    return acc;
  }, {});

  const agents = countByAction(agentPlans);
  const projects = countByAction(projectPlans);
  const issues = countByAction(issuePlans);
  const warnings = Array.isArray(previewResult?.warnings) ? previewResult.warnings.length : 0;
  const errors = Array.isArray(previewResult?.errors) ? previewResult.errors.length : 0;
  const collisions = (agents.update ?? 0)
    + (agents.skip ?? 0)
    + (projects.update ?? 0)
    + (projects.skip ?? 0)
    + (issues.skip ?? 0);

  return {
    counts: {
      agents,
      projects,
      issues,
    },
    warnings,
    errors,
    collisions,
  };
}

export function assertApplyAllowed({ apply, yes, previewSummary, maxCollisions }) {
  requireApplyConfirmation({ apply, yes });
  if (!apply) return;
  if (!previewSummary) {
    throw new Error("Resumo de preview ausente para validação de apply.");
  }
  if (previewSummary.errors > 0) {
    throw new Error(`Apply bloqueado: preview contém ${previewSummary.errors} erro(s).`);
  }
  if (maxCollisions !== null && previewSummary.collisions > maxCollisions) {
    throw new Error(
      `Apply bloqueado: preview contém ${previewSummary.collisions} colisão(ões), acima do limite ${maxCollisions}.`,
    );
  }
}

export function buildOnboardingExecutionReport({
  apiBase,
  previewRoute,
  applyRoute,
  requestBody,
  previewSummary,
  previewPath,
  previewSummaryPath,
  applyPath,
  applyExecuted,
}) {
  return {
    generatedAt: process.env.STN_GENERATED_AT ?? new Date().toISOString(),
    apiBase,
    routes: {
      preview: previewRoute,
      apply: applyRoute,
    },
    request: {
      target: requestBody?.target ?? null,
      collisionStrategy: requestBody?.collisionStrategy ?? null,
      include: requestBody?.include ?? null,
      agents: requestBody?.agents ?? null,
    },
    preview: {
      outputFile: previewPath,
      summaryFile: previewSummaryPath,
      summary: previewSummary,
    },
    apply: {
      executed: applyExecuted,
      outputFile: applyPath,
    },
  };
}

async function postJson(apiBase, route, body, authHeaders = {}) {
  const response = await fetch(`${apiBase}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
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
    token: null,
    tokenEnvVar: DEFAULT_TOKEN_ENV_VAR,
    noAuth: false,
    apply: false,
    yes: false,
    maxCollisions: null,
    collisionStrategy: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--request" || arg === "--output-dir" || arg === "--api-base" || arg === "--target-company-id" || arg === "--token" || arg === "--token-env-var") && argv[i + 1]) {
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
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--yes") {
      options.yes = true;
      continue;
    }
    if (arg === "--collision-strategy" && argv[i + 1]) {
      options.collisionStrategy = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === "--max-collisions" && argv[i + 1]) {
      const parsed = Number.parseInt(String(argv[i + 1]).trim(), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Valor inválido para --max-collisions. Use inteiro >= 0.");
      }
      options.maxCollisions = parsed;
      i += 1;
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
    "  --token <value>",
    "  --token-env-var <name>",
    "  --no-auth",
    "  --collision-strategy <rename|skip>",
    "  --apply",
    "  --yes",
    "  --max-collisions <n>",
    "",
    `Defaults:`,
    `  request:    ${DEFAULT_REQUEST}`,
    `  output-dir: ${DEFAULT_OUTPUT_DIR}`,
    `  api-base:   ${DEFAULT_API_BASE}`,
    `  token env:  ${DEFAULT_TOKEN_ENV_VAR}`,
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
  const previewRoute = resolvePreviewRoute(targetMode, targetCompanyId);
  const applyRoute = resolveApplyRoute(targetMode, targetCompanyId);
  const authHeaders = buildAuthHeaders(args);

  const previewResult = await postJson(args.apiBase, previewRoute, requestBody, authHeaders);
  await mkdir(args.outputDir, { recursive: true });
  const previewPath = path.join(args.outputDir, "stn-import-preview-result.json");
  await writeFile(previewPath, `${JSON.stringify(previewResult, null, 2)}\n`, "utf8");
  const previewSummary = summarizePreviewPlan(previewResult);
  const previewSummaryPath = path.join(args.outputDir, "stn-import-preview-summary.json");
  await writeFile(previewSummaryPath, `${JSON.stringify(previewSummary, null, 2)}\n`, "utf8");
  assertApplyAllowed({
    apply: args.apply,
    yes: args.yes,
    previewSummary,
    maxCollisions: args.maxCollisions,
  });

  let applyPath = null;
  if (args.apply) {
    const applyResult = await postJson(args.apiBase, applyRoute, requestBody, authHeaders);
    applyPath = path.join(args.outputDir, "stn-import-apply-result.json");
    await writeFile(applyPath, `${JSON.stringify(applyResult, null, 2)}\n`, "utf8");
  }
  const executionReport = buildOnboardingExecutionReport({
    apiBase: args.apiBase,
    previewRoute,
    applyRoute,
    requestBody,
    previewSummary,
    previewPath,
    previewSummaryPath,
    applyPath,
    applyExecuted: args.apply,
  });
  const executionReportPath = path.join(args.outputDir, "stn-onboarding-execution-report.json");
  await writeFile(executionReportPath, `${JSON.stringify(executionReport, null, 2)}\n`, "utf8");

  process.stdout.write([
    `Preview salvo em: ${previewPath}`,
    `Resumo do preview salvo em: ${previewSummaryPath}`,
    `Relatório de execução salvo em: ${executionReportPath}`,
    args.apply ? `Apply salvo em: ${applyPath}` : "Apply não executado (use --apply --yes).",
    `Preview warnings: ${previewSummary.warnings} | errors: ${previewSummary.errors} | collisions: ${previewSummary.collisions}`,
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
