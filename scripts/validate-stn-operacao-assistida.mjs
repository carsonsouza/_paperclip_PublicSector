import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { generateTemplateFiles } from "./generate-stn-company-template.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_INPUT = path.join(REPO_ROOT, "report", "stn", "stn-estrutura-competencias-20260415.json");
const DEFAULT_TEMPLATE_DIR = path.join(REPO_ROOT, "report", "stn", "template-stn-company-pilot");
const DEFAULT_APPROVAL_MAP = path.join(REPO_ROOT, "report", "stn", "stn-approval-participants.json");
const DEFAULT_INDICATORS_MAP = path.join(REPO_ROOT, "report", "stn", "stn-operational-indicators.json");
const DEFAULT_USER_CATALOG = path.join(REPO_ROOT, "report", "stn", "stn-governance-user-catalog.json");
const DEFAULT_VISUAL_IDENTITY = path.join(REPO_ROOT, "report", "stn", "stn-visual-identity.json");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "report", "stn", "stn-operacao-assistida-report.json");
const DEFAULT_PILOT_SIGLAS = ["SUGEF", "SUAFI", "SUCON"];

function normalizeSigla(value) {
  return String(value ?? "").trim().toUpperCase();
}

function selectUnitsForPilot(units, pilotSiglas) {
  if (!Array.isArray(pilotSiglas) || pilotSiglas.length === 0) return units;
  const bySigla = new Map(
    units
      .filter((unit) => typeof unit?.sigla === "string" && unit.sigla.trim().length > 0)
      .map((unit) => [normalizeSigla(unit.sigla), unit]),
  );
  const childrenByParent = new Map();
  for (const unit of units) {
    const parent = normalizeSigla(unit.parentSigla);
    if (!parent) continue;
    const children = childrenByParent.get(parent) ?? [];
    children.push(unit);
    childrenByParent.set(parent, children);
  }

  const selected = new Set();
  const addWithAncestors = (sigla) => {
    let current = bySigla.get(sigla) ?? null;
    while (current) {
      const currentSigla = normalizeSigla(current.sigla);
      if (!currentSigla || selected.has(currentSigla)) break;
      selected.add(currentSigla);
      current = bySigla.get(normalizeSigla(current.parentSigla)) ?? null;
    }
  };
  const addDescendants = (sigla) => {
    const queue = [sigla];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      selected.add(current);
      const children = childrenByParent.get(current) ?? [];
      for (const child of children) queue.push(normalizeSigla(child.sigla));
    }
  };

  if (bySigla.has("STN")) selected.add("STN");
  const requested = pilotSiglas.map(normalizeSigla).filter((entry) => bySigla.has(entry));
  for (const sigla of requested) addWithAncestors(sigla);
  for (const sigla of requested) addDescendants(sigla);

  return units.filter((unit) => selected.has(normalizeSigla(unit.sigla)));
}

function resolveGovernanceParticipants(unit, approvalMap) {
  const unitSigla = normalizeSigla(unit.sigla);
  const unitConfig = approvalMap?.units?.[unitSigla] ?? null;
  const globalConfig = approvalMap?.global ?? null;

  const fallbackReviewer = `${unitSigla.toLowerCase()}-reviewer`;
  const fallbackApprover = `${unitSigla.toLowerCase()}-approver`;

  return {
    reviewerUserId: unitConfig?.reviewerUserId ?? globalConfig?.reviewerUserId ?? fallbackReviewer,
    approverUserId: unitConfig?.approverUserId ?? globalConfig?.approverUserId ?? fallbackApprover,
  };
}

function resolveOperationalIndicators(unit, indicatorsMap) {
  const globalIndicators = Array.isArray(indicatorsMap?.global) ? indicatorsMap.global : [];
  const unitIndicators = Array.isArray(indicatorsMap?.units?.[normalizeSigla(unit.sigla)])
    ? indicatorsMap.units[normalizeSigla(unit.sigla)]
    : [];
  return [...globalIndicators, ...unitIndicators];
}

function buildUserIdSet(userCatalog) {
  if (!userCatalog) return new Set();
  const ids = new Set();
  if (Array.isArray(userCatalog.userIds)) {
    for (const entry of userCatalog.userIds) ids.add(String(entry));
  }
  if (Array.isArray(userCatalog.users)) {
    for (const user of userCatalog.users) {
      if (user && typeof user === "object" && "userId" in user && user.userId) ids.add(String(user.userId));
    }
  }
  return ids;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export function buildOperacaoAssistidaReport({
  structure,
  pilotSiglas,
  approvalMap,
  indicatorsMap,
  userCatalog,
  visualIdentity,
  generatedAt,
}) {
  const allUnits = Array.isArray(structure?.units) ? structure.units : [];
  const selectedUnits = selectUnitsForPilot(allUnits, pilotSiglas);
  const topUnits = selectedUnits.filter((unit) => unit.level === 2);
  const knownUsers = buildUserIdSet(userCatalog);
  const units = [];
  const warnings = [];
  let unresolvedUserRefs = 0;
  let unitsWithoutIndicators = 0;
  const visualIdentityConfigured = Boolean(visualIdentity);

  for (const unit of topUnits) {
    const governanceParticipants = resolveGovernanceParticipants(unit, approvalMap);
    const operationalIndicators = resolveOperationalIndicators(unit, indicatorsMap);
    const reviewerKnown = knownUsers.size === 0 ? null : knownUsers.has(governanceParticipants.reviewerUserId);
    const approverKnown = knownUsers.size === 0 ? null : knownUsers.has(governanceParticipants.approverUserId);
    if (reviewerKnown === false) unresolvedUserRefs += 1;
    if (approverKnown === false) unresolvedUserRefs += 1;
    if (operationalIndicators.length === 0) {
      unitsWithoutIndicators += 1;
      warnings.push(`Unidade ${unit.sigla} sem indicadores operacionais definidos.`);
    }
    units.push({
      sigla: unit.sigla,
      nome: unit.nome,
      governanceParticipants,
      governanceCoverage: {
        reviewerMapped: reviewerKnown,
        approverMapped: approverKnown,
      },
      indicators: operationalIndicators.map((indicator) => ({
        id: indicator.id ?? null,
        name: indicator.name ?? null,
        periodicity: indicator.periodicity ?? null,
      })),
      indicatorsCount: operationalIndicators.length,
    });
  }

  const status = unitsWithoutIndicators > 0
    ? "attention_needed"
    : unresolvedUserRefs > 0
      ? "attention_needed"
      : !visualIdentityConfigured
        ? "attention_needed"
        : "ready";

  if (!visualIdentityConfigured) {
    warnings.push("Manual de identidade visual STN não configurado para o template.");
  }

  return {
    generatedAt: generatedAt ?? process.env.STN_GENERATED_AT ?? new Date().toISOString(),
    status,
    pilotSiglas: pilotSiglas.map(normalizeSigla),
    summary: {
      selectedUnits: selectedUnits.length,
      topUnits: topUnits.length,
      unresolvedUserRefs,
      unitsWithoutIndicators,
      userCatalogProvided: knownUsers.size > 0,
      visualIdentityConfigured,
    },
    units,
    warnings,
  };
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    templateDir: DEFAULT_TEMPLATE_DIR,
    approvalMap: DEFAULT_APPROVAL_MAP,
    indicatorsMap: DEFAULT_INDICATORS_MAP,
    userCatalog: DEFAULT_USER_CATALOG,
    visualIdentity: DEFAULT_VISUAL_IDENTITY,
    output: DEFAULT_OUTPUT,
    pilotSiglas: [...DEFAULT_PILOT_SIGLAS],
    generatedAt: process.env.STN_GENERATED_AT ?? null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--input" || arg === "--template-dir" || arg === "--approval-map"
      || arg === "--indicators-map" || arg === "--user-catalog" || arg === "--visual-identity" || arg === "--output")
      && argv[i + 1]) {
      const target = arg.replace(/^--/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[target] = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--pilot-siglas" && argv[i + 1]) {
      options.pilotSiglas = argv[i + 1]
        .split(",")
        .map((entry) => normalizeSigla(entry))
        .filter((entry) => entry.length > 0);
      i += 1;
      continue;
    }
    if (arg === "--generated-at" && argv[i + 1]) {
      options.generatedAt = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") options.help = true;
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage: node scripts/validate-stn-operacao-assistida.mjs [options]",
    "",
    "Options:",
    "  --input <json>",
    "  --template-dir <dir>",
    "  --approval-map <json>",
    "  --indicators-map <json>",
    "  --user-catalog <json>",
    "  --visual-identity <json>",
    "  --pilot-siglas <CSV>",
    "  --generated-at <iso8601>",
    "  --output <json>",
    "",
    `Defaults:`,
    `  input:          ${DEFAULT_INPUT}`,
    `  template-dir:   ${DEFAULT_TEMPLATE_DIR}`,
    `  approval-map:   ${DEFAULT_APPROVAL_MAP}`,
    `  indicators-map: ${DEFAULT_INDICATORS_MAP}`,
    `  user-catalog:   ${DEFAULT_USER_CATALOG}`,
    `  visual-identity:${DEFAULT_VISUAL_IDENTITY}`,
    `  output:         ${DEFAULT_OUTPUT}`,
    `  pilot-siglas:   ${DEFAULT_PILOT_SIGLAS.join(",")}`,
    "Env override:",
    "  STN_GENERATED_AT=<iso8601>",
    "",
  ].join("\n"));
}

async function loadJsonOrNull(filePath) {
  if (!(await fileExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const [structure, approvalMap, indicatorsMap, userCatalog, visualIdentity] = await Promise.all([
    loadJsonOrNull(args.input),
    loadJsonOrNull(args.approvalMap),
    loadJsonOrNull(args.indicatorsMap),
    loadJsonOrNull(args.userCatalog),
    loadJsonOrNull(args.visualIdentity),
  ]);
  if (!structure) throw new Error(`Arquivo de estrutura não encontrado: ${args.input}`);

  const report = buildOperacaoAssistidaReport({
    structure,
    pilotSiglas: args.pilotSiglas,
    approvalMap,
    indicatorsMap,
    userCatalog,
    visualIdentity,
    generatedAt: args.generatedAt,
  });

  const expectedFiles = generateTemplateFiles(structure, {
    pilotSiglas: args.pilotSiglas,
    approvalMap,
    indicatorsMap,
    visualIdentity,
  });
  const missingFiles = [];
  for (const relativePath of Object.keys(expectedFiles)) {
    const target = path.join(args.templateDir, relativePath);
    if (!(await fileExists(target))) missingFiles.push(relativePath);
  }

  const finalReport = {
    ...report,
    importReadiness: {
      templateDir: args.templateDir,
      expectedFiles: Object.keys(expectedFiles).length,
      missingFiles,
      status: missingFiles.length === 0 ? "ready" : "attention_needed",
    },
  };
  if (missingFiles.length > 0) {
    finalReport.status = "attention_needed";
    finalReport.warnings.push(`Template piloto incompleto: ${missingFiles.length} arquivo(s) ausente(s).`);
  }

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
  process.stdout.write([
    `Relatório gerado em: ${args.output}`,
    `Status: ${finalReport.status}`,
    `Top units: ${finalReport.summary.topUnits}`,
    `Missing files: ${finalReport.importReadiness.missingFiles.length}`,
    "",
  ].join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
