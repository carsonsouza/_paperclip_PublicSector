import path from "node:path";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_TEMPLATE_DIR = path.join(REPO_ROOT, "report", "stn", "template-stn-company-pilot");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "report", "stn", "stn-import-payload-pilot.json");
const DEFAULT_REQUEST_OUTPUT = path.join(REPO_ROOT, "report", "stn", "stn-import-request-pilot.json");
const DEFAULT_INCLUDE = {
  company: true,
  agents: true,
  projects: true,
  issues: true,
  skills: false,
};
const DEFAULT_TARGET = {
  mode: "new_company",
  newCompanyName: "Secretaria do Tesouro Nacional - Piloto",
};
const DEFAULT_COLLISION_STRATEGY = "rename";
const VALID_COLLISION_STRATEGIES = new Set(["rename", "skip"]);

const REQUIRED_FILES = [
  "COMPANY.md",
  ".paperclip.yaml",
];

function normalizePath(input) {
  return input.replace(/\\/g, "/");
}

async function collectFiles(rootDir, currentDir, acc) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".git")) continue;
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(rootDir, absolutePath, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = normalizePath(path.relative(rootDir, absolutePath));
    const content = await readFile(absolutePath, "utf8");
    acc[relativePath] = content;
  }
}

function normalizeCollisionStrategy(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!VALID_COLLISION_STRATEGIES.has(normalized)) {
    throw new Error("Valor inválido para collision strategy. Use: rename | skip");
  }
  return normalized;
}

export function buildImportPayload({ rootPath, files, target, include, collisionStrategy = DEFAULT_COLLISION_STRATEGY }) {
  const issues = [];
  for (const required of REQUIRED_FILES) {
    if (!files[required]) {
      issues.push(`Arquivo obrigatório ausente no pacote: ${required}`);
    }
  }

  const agentFiles = Object.keys(files).filter((entry) => entry.endsWith("/AGENTS.md")).length;
  const projectFiles = Object.keys(files).filter((entry) => entry.endsWith("/PROJECT.md")).length;
  const taskFiles = Object.keys(files).filter((entry) => entry.endsWith("/TASK.md")).length;

  if (agentFiles === 0) issues.push("Pacote sem AGENTS.md.");
  if (projectFiles === 0) issues.push("Pacote sem PROJECT.md.");
  if (taskFiles === 0) issues.push("Pacote sem TASK.md.");

  const payload = {
    source: {
      type: "inline",
      rootPath,
      files,
    },
    include,
    target,
    agents: "all",
    collisionStrategy: normalizeCollisionStrategy(collisionStrategy),
  };

  return {
    payload,
    summary: {
      rootPath,
      files: Object.keys(files).length,
      agents: agentFiles,
      projects: projectFiles,
      tasks: taskFiles,
      issues,
      status: issues.length === 0 ? "ready" : "attention_needed",
    },
  };
}

export function buildImportRequest(result) {
  return result.payload;
}

function parseArgs(argv) {
  const options = {
    templateDir: DEFAULT_TEMPLATE_DIR,
    output: DEFAULT_OUTPUT,
    requestOutput: DEFAULT_REQUEST_OUTPUT,
    targetMode: "new_company",
    targetCompanyId: null,
    newCompanyName: DEFAULT_TARGET.newCompanyName,
    collisionStrategy: DEFAULT_COLLISION_STRATEGY,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--template-dir" && argv[i + 1]) {
      options.templateDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--output" && argv[i + 1]) {
      options.output = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--request-output" && argv[i + 1]) {
      options.requestOutput = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--target" && argv[i + 1]) {
      const value = String(argv[i + 1]).trim().toLowerCase();
      if (!["new", "existing"].includes(value)) {
        throw new Error("Valor inválido para --target. Use: new | existing");
      }
      options.targetMode = value === "new" ? "new_company" : "existing_company";
      i += 1;
      continue;
    }
    if (arg === "--target-company-id" && argv[i + 1]) {
      options.targetCompanyId = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === "--new-company-name" && argv[i + 1]) {
      options.newCompanyName = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (arg === "--collision-strategy" && argv[i + 1]) {
      options.collisionStrategy = normalizeCollisionStrategy(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    "Usage: node scripts/build-stn-import-payload.mjs [options]",
    "",
    "Options:",
    "  --template-dir <path>",
    "  --output <path>",
    "  --request-output <path>",
    "  --target <new|existing>",
    "  --target-company-id <id>",
    "  --new-company-name <name>",
    "  --collision-strategy <rename|skip>",
    "",
    `Defaults:`,
    `  template-dir: ${DEFAULT_TEMPLATE_DIR}`,
    `  output:       ${DEFAULT_OUTPUT}`,
    `  request:      ${DEFAULT_REQUEST_OUTPUT}`,
    `  target:       new`,
    `  collision:    ${DEFAULT_COLLISION_STRATEGY}`,
    "",
  ].join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const templateStats = await stat(args.templateDir).catch(() => null);
  if (!templateStats || !templateStats.isDirectory()) {
    throw new Error(`Diretório de template não encontrado: ${args.templateDir}`);
  }

  const files = {};
  await collectFiles(args.templateDir, args.templateDir, files);
  const target = args.targetMode === "existing_company"
    ? {
      mode: "existing_company",
      companyId: args.targetCompanyId,
    }
    : {
      mode: "new_company",
      newCompanyName: args.newCompanyName || DEFAULT_TARGET.newCompanyName,
    };
  if (target.mode === "existing_company" && !target.companyId) {
    throw new Error("Para --target existing, informe --target-company-id.");
  }

  const result = buildImportPayload({
    rootPath: path.basename(args.templateDir),
    files,
    target,
    include: DEFAULT_INCLUDE,
    collisionStrategy: args.collisionStrategy,
  });
  const requestPayload = buildImportRequest(result);
  await mkdir(path.dirname(args.output), { recursive: true });
  await mkdir(path.dirname(args.requestOutput), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(args.requestOutput, `${JSON.stringify(requestPayload, null, 2)}\n`, "utf8");

  process.stdout.write([
    `Payload gerado em: ${args.output}`,
    `Request gerado em: ${args.requestOutput}`,
    `Status: ${result.summary.status}`,
    `Files: ${result.summary.files} | Agents: ${result.summary.agents} | Projects: ${result.summary.projects} | Tasks: ${result.summary.tasks}`,
    "",
  ].join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
