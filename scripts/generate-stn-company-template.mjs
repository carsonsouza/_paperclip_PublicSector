import path from "node:path";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_INPUT = path.join(REPO_ROOT, "report", "stn", "stn-estrutura-competencias-20260415.json");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, "report", "stn", "template-stn-company");
const DEFAULT_PILOT_OUTPUT_DIR = path.join(REPO_ROOT, "report", "stn", "template-stn-company-pilot");
const DEFAULT_APPROVAL_MAP = path.join(REPO_ROOT, "report", "stn", "stn-approval-participants.json");
const DEFAULT_INDICATORS_MAP = path.join(REPO_ROOT, "report", "stn", "stn-operational-indicators.json");

function quoteYamlString(value) {
  return JSON.stringify(value);
}

function renderFrontmatter(frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${quoteYamlString(String(item))}`);
      }
      continue;
    }
    lines.push(`${key}: ${quoteYamlString(String(value))}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function buildMarkdown(frontmatter, body = "") {
  const content = body.trim();
  if (!content) return `${renderFrontmatter(frontmatter)}\n`;
  return `${renderFrontmatter(frontmatter)}\n\n${content}\n`;
}

function renderYamlScalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}

function renderYamlBlock(value, indentLevel = 0) {
  const indent = "  ".repeat(indentLevel);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[]`];
    return value.flatMap((entry) => {
      const isObject = entry && typeof entry === "object" && !Array.isArray(entry);
      if (!isObject) return [`${indent}- ${renderYamlScalar(entry)}`];
      const entries = Object.entries(entry);
      if (entries.length === 0) return [`${indent}- {}`];
      const [firstKey, firstValue] = entries[0];
      const lines = [];
      if (firstValue && typeof firstValue === "object") {
        lines.push(`${indent}- ${firstKey}:`);
        lines.push(...renderYamlBlock(firstValue, indentLevel + 2));
      } else {
        lines.push(`${indent}- ${firstKey}: ${renderYamlScalar(firstValue)}`);
      }
      for (const [key, nested] of entries.slice(1)) {
        if (nested && typeof nested === "object") {
          lines.push(`${indent}  ${key}:`);
          lines.push(...renderYamlBlock(nested, indentLevel + 2));
        } else {
          lines.push(`${indent}  ${key}: ${renderYamlScalar(nested)}`);
        }
      }
      return lines;
    });
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${indent}{}`];
    return entries.flatMap(([key, nested]) => {
      if (nested && typeof nested === "object") {
        return [`${indent}${key}:`, ...renderYamlBlock(nested, indentLevel + 1)];
      }
      return [`${indent}${key}: ${renderYamlScalar(nested)}`];
    });
  }

  return [`${indent}${renderYamlScalar(value)}`];
}

function toYamlDocument(obj) {
  return `${renderYamlBlock(obj, 0).join("\n")}\n`;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unitSlug(unit) {
  const bySigla = slugify(unit.sigla ?? "");
  if (bySigla) return bySigla;
  return slugify(unit.nome ?? "unidade");
}

function summarizeCompetencies(unit) {
  const maxItems = 6;
  const selected = unit.competencias.slice(0, maxItems);
  const bullets = selected.map((item) => `- **${item.code}**: ${item.text}`);
  const remaining = unit.competencias.length - selected.length;
  if (remaining > 0) bullets.push(`- ... e mais ${remaining} competências registradas no catálogo institucional.`);
  return bullets.join("\n");
}

function fileExists(targetPath) {
  return access(targetPath)
    .then(() => true)
    .catch((error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
      throw error;
    });
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

export function generateTemplateFiles(structure, options = {}) {
  const files = {};
  const allUnits = Array.isArray(structure.units) ? structure.units : [];
  const units = selectUnitsForPilot(allUnits, options.pilotSiglas ?? null);
  const bySigla = new Map(units.map((unit) => [unit.sigla, unit]));
  const slugBySigla = new Map(units.map((unit) => [unit.sigla, unitSlug(unit)]));

  files["COMPANY.md"] = buildMarkdown(
    {
      schema: "agentcompanies/v1",
      kind: "company",
      name: "Secretaria do Tesouro Nacional",
      slug: "tesouro-nacional",
      description: "Template operacional STN gerado a partir do regimento institucional.",
    },
    [
      "Template institucional da STN para uso no Paperclip.",
      "",
      "Este pacote foi gerado automaticamente a partir do relatório dinâmico de competências.",
      "O objetivo é prover estrutura organizacional inicial e base operacional para a Fase 1.",
    ].join("\n"),
  );

  for (const unit of units) {
    const slug = slugBySigla.get(unit.sigla) ?? unitSlug(unit);
    const parentUnit = unit.parentSigla ? bySigla.get(unit.parentSigla) ?? null : null;
    const parentSlug = parentUnit ? slugBySigla.get(parentUnit.sigla) ?? unitSlug(parentUnit) : null;
    files[`agents/${slug}/AGENTS.md`] = buildMarkdown(
      {
        schema: "agentcompanies/v1",
        kind: "agent",
        name: unit.sigla,
        title: unit.nome,
        reportsTo: parentSlug,
      },
      [
        `Unidade organizacional: ${unit.nome} (${unit.sigla}).`,
        "",
        "Competências institucionais (resumo):",
        summarizeCompetencies(unit),
      ].join("\n"),
    );
  }

  const unidadesTopo = units.filter((unit) => unit.level === 2);
  const tasksExtension = {};
  for (const unit of unidadesTopo) {
    const ownerSlug = slugBySigla.get(unit.sigla) ?? unitSlug(unit);
    const projectSlug = `operacao-${ownerSlug}`;
    const taskSlug = `plano-competencias-${ownerSlug}`;
    files[`projects/${projectSlug}/PROJECT.md`] = buildMarkdown(
      {
        schema: "agentcompanies/v1",
        kind: "project",
        name: `Operação ${unit.sigla}`,
        slug: projectSlug,
        owner: ownerSlug,
      },
      `Projeto operacional inicial para organizar e executar competências da unidade ${unit.nome}.`,
    );
    files[`tasks/${taskSlug}/TASK.md`] = buildMarkdown(
      {
        schema: "agentcompanies/v1",
        kind: "task",
        name: `Plano operacional de competências - ${unit.sigla}`,
        assignee: ownerSlug,
        project: projectSlug,
      },
      [
        `Construir backlog operacional da ${unit.nome} com base nas competências regimentais.`,
        "",
        "Entregáveis mínimos:",
        "- priorização de competências em ciclos trimestrais;",
        "- definição de fluxo de aprovação para atos críticos;",
        "- critérios de monitoramento e prestação de contas.",
      ].join("\n"),
    );

    const principalCompetencia = unit.competencias[0] ?? null;
    const governanceParticipants = resolveGovernanceParticipants(unit, options.approvalMap ?? null);
    const operationalIndicators = resolveOperationalIndicators(unit, options.indicatorsMap ?? null);
    tasksExtension[taskSlug] = {
      priority: "high",
      executionPolicy: {
        mode: "normal",
        commentRequired: true,
        stages: [
          {
            type: "review",
            approvalsNeeded: 1,
            participants: [{ type: "user", userId: governanceParticipants.reviewerUserId }],
          },
          {
            type: "approval",
            approvalsNeeded: 1,
            participants: [{ type: "user", userId: governanceParticipants.approverUserId }],
          },
        ],
      },
      metadata: {
        publicSector: {
          unitSigla: unit.sigla,
          unitNome: unit.nome,
          competencyRef: principalCompetencia
            ? `${unit.sigla}:${principalCompetencia.code}`
            : `${unit.sigla}:GERAL`,
          governanceClass: "ato_critico",
          auditTrailRequired: true,
          source: "regimento_stn_20260415",
          governanceParticipants,
          operationalIndicators,
        },
      },
    };
  }

  files[".paperclip.yaml"] = toYamlDocument({
    company: {
      requireBoardApprovalForNewAgents: true,
    },
    tasks: tasksExtension,
  });

  return files;
}

async function writeFiles(baseDir, files) {
  await rm(baseDir, { recursive: true, force: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(baseDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
    pilotSiglas: [],
    outputDirProvided: false,
    approvalMap: null,
    indicatorsMap: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      options.input = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--output-dir" && argv[i + 1]) {
      options.outputDir = path.resolve(argv[i + 1]);
      options.outputDirProvided = true;
      i += 1;
      continue;
    }
    if (arg === "--pilot-siglas" && argv[i + 1]) {
      options.pilotSiglas = argv[i + 1]
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      i += 1;
      continue;
    }
    if (arg === "--approval-map" && argv[i + 1]) {
      options.approvalMap = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--indicators-map" && argv[i + 1]) {
      options.indicatorsMap = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, ...options };
    }
  }

  if (options.pilotSiglas.length > 0 && !options.outputDirProvided) {
    options.outputDir = DEFAULT_PILOT_OUTPUT_DIR;
  }

  return { help: false, ...options };
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/generate-stn-company-template.mjs [--input <json>] [--output-dir <dir>]",
      "       node scripts/generate-stn-company-template.mjs --pilot-siglas SUGEF,SUAFI,SUCON",
      "       node scripts/generate-stn-company-template.mjs --approval-map report/stn/stn-approval-participants.json",
      "       node scripts/generate-stn-company-template.mjs --indicators-map report/stn/stn-operational-indicators.json",
      "",
      `Default input:      ${DEFAULT_INPUT}`,
      `Default output dir: ${DEFAULT_OUTPUT_DIR}`,
      `Pilot output dir:   ${DEFAULT_PILOT_OUTPUT_DIR}`,
      `Default approval map: ${DEFAULT_APPROVAL_MAP}`,
      `Default indicators map: ${DEFAULT_INDICATORS_MAP}`,
      "",
    ].join("\n"),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const raw = await readFile(args.input, "utf8");
  const structure = JSON.parse(raw);
  const approvalMapPath = args.approvalMap
    ? args.approvalMap
    : (await fileExists(DEFAULT_APPROVAL_MAP) ? DEFAULT_APPROVAL_MAP : null);
  const indicatorsMapPath = args.indicatorsMap
    ? args.indicatorsMap
    : (await fileExists(DEFAULT_INDICATORS_MAP) ? DEFAULT_INDICATORS_MAP : null);
  const approvalMap = approvalMapPath ? JSON.parse(await readFile(approvalMapPath, "utf8")) : null;
  const indicatorsMap = indicatorsMapPath ? JSON.parse(await readFile(indicatorsMapPath, "utf8")) : null;
  const files = generateTemplateFiles(structure, {
    pilotSiglas: args.pilotSiglas,
    approvalMap,
    indicatorsMap,
  });
  await writeFiles(args.outputDir, files);

  const agentFiles = Object.keys(files).filter((entry) => entry.endsWith("/AGENTS.md")).length;
  const projectFiles = Object.keys(files).filter((entry) => entry.endsWith("/PROJECT.md")).length;
  const taskFiles = Object.keys(files).filter((entry) => entry.endsWith("/TASK.md")).length;

  process.stdout.write(
    [
      `Template gerado em: ${args.outputDir}`,
      `Arquivos: ${Object.keys(files).length}`,
      `Agents: ${agentFiles} | Projects: ${projectFiles} | Tasks: ${taskFiles}`,
      "",
    ].join("\n"),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
