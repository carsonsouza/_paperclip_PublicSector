import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_INPUT = path.join(REPO_ROOT, "report", "stn", "stn-estrutura-competencias-20260415.json");
const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, "report", "stn", "template-stn-company");

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

export function generateTemplateFiles(structure) {
  const files = {};
  const units = Array.isArray(structure.units) ? structure.units : [];
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
  }

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
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, ...options };
    }
  }

  return { help: false, ...options };
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/generate-stn-company-template.mjs [--input <json>] [--output-dir <dir>]",
      "",
      `Default input:      ${DEFAULT_INPUT}`,
      `Default output dir: ${DEFAULT_OUTPUT_DIR}`,
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
  const files = generateTemplateFiles(structure);
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
