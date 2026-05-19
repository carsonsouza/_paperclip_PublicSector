import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_INPUT = path.join(REPO_ROOT, "20260415 relatorio-dinamico-estrutura-viva.html");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "report", "stn", "stn-estrutura-competencias-20260415.json");

const TYPE_LEVEL = {
  secretaria: 1,
  subsecretaria: 2,
  assessoria: 2,
  gabinete: 2,
  comite: 2,
  coordenacao_geral: 3,
  coordenacao: 4,
  gerencia: 5,
  nucleo: 6,
  unidade: 4,
};

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanText(value) {
  return normalizeWhitespace(decodeHtmlEntities(stripTags(value)));
}

function classifyUnitType(name) {
  const n = name.toLowerCase();
  if (n.startsWith("secretaria do tesouro nacional")) return "secretaria";
  if (n.startsWith("subsecretaria")) return "subsecretaria";
  if (n.startsWith("coordenação-geral") || n.startsWith("coordenacao-geral")) return "coordenacao_geral";
  if (n.startsWith("coordenação") || n.startsWith("coordenacao")) return "coordenacao";
  if (n.startsWith("gerência") || n.startsWith("gerencia")) return "gerencia";
  if (n.startsWith("núcleo") || n.startsWith("nucleo")) return "nucleo";
  if (n.startsWith("assessoria")) return "assessoria";
  if (n.startsWith("gabinete")) return "gabinete";
  if (n.startsWith("comitê") || n.startsWith("comite")) return "comite";
  return "unidade";
}

function splitCompetencyLines(htmlBlock) {
  return htmlBlock
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function parseCompetencies(htmlBlock) {
  const lines = splitCompetencyLines(htmlBlock);
  const competencies = [];

  for (const line of lines) {
    const romanMatch = line.match(/^([IVXLCDM]+)\s*-\s*(.+)$/i);
    if (romanMatch) {
      competencies.push({
        code: romanMatch[1].toUpperCase(),
        text: romanMatch[2].trim(),
      });
      continue;
    }

    const paragraphMatch = line.match(/^§\s*(\d+º?)\s*(.+)$/i);
    if (paragraphMatch) {
      competencies.push({
        code: `§${paragraphMatch[1]}`,
        text: paragraphMatch[2].trim(),
      });
      continue;
    }

    const subitemMatch = line.match(/^([a-z])\)\s*(.+)$/i);
    if (subitemMatch && competencies.length > 0) {
      competencies[competencies.length - 1].text += ` ${subitemMatch[1].toLowerCase()}) ${subitemMatch[2].trim()}`;
      continue;
    }

    if (competencies.length === 0) {
      competencies.push({
        code: "GERAL",
        text: line,
      });
      continue;
    }

    competencies[competencies.length - 1].text += ` ${line}`;
  }

  return competencies;
}

function inferHierarchy(units) {
  const stack = [];
  const secretariaRaiz = units.find((unit) => unit.type === "secretaria") ?? null;

  return units.map((unit) => {
    const level = TYPE_LEVEL[unit.type] ?? TYPE_LEVEL.unidade;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    let parent = stack.length > 0 ? stack[stack.length - 1].unit : null;
    if (!parent && unit.type !== "secretaria" && secretariaRaiz && unit.sigla !== secretariaRaiz.sigla) {
      parent = secretariaRaiz;
    }

    const enriched = {
      ...unit,
      level,
      parentSigla: parent?.sigla ?? null,
      parentNome: parent?.nome ?? null,
    };

    stack.push({ level, unit: enriched });
    return enriched;
  });
}

function resolveGeneratedAt(value) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid generatedAt value: ${value}`);
  }
  return parsed.toISOString();
}

export function extractStnStructure(htmlContent, sourceFile = null, options = {}) {
  const titleMatch = htmlContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? cleanText(titleMatch[1]) : "Relatorio SIORG";

  const rowPattern = /<tr class="bold-row"[^>]*>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>\s*<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  const rows = [];
  let match;
  while ((match = rowPattern.exec(htmlContent)) !== null) {
    const nome = cleanText(match[1]);
    const sigla = cleanText(match[2]).replace(/\s+/g, "");
    const competencias = parseCompetencies(match[3]);
    rows.push({
      nome,
      sigla,
      type: classifyUnitType(nome),
      competencias,
      totalCompetencias: competencias.length,
    });
  }

  const units = inferHierarchy(rows).map((unit, index) => ({
    id: index + 1,
    ...unit,
  }));

  const countByType = {};
  for (const unit of units) {
    countByType[unit.type] = (countByType[unit.type] ?? 0) + 1;
  }

  return {
    schemaVersion: "stn-estrutura-competencias/v1",
    source: {
      title,
      file: sourceFile,
    },
    generatedAt: resolveGeneratedAt(options.generatedAt ?? process.env.STN_GENERATED_AT ?? null),
    summary: {
      totalUnidades: units.length,
      totalCompetencias: units.reduce((acc, unit) => acc + unit.totalCompetencias, 0),
      totalUnidadesComCompetencias: units.filter((unit) => unit.totalCompetencias > 0).length,
      tiposDeUnidade: countByType,
    },
    units,
  };
}

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    generatedAt: process.env.STN_GENERATED_AT ?? null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      options.input = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--output" && argv[i + 1]) {
      options.output = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, ...options };
    }
    if (arg === "--generated-at" && argv[i + 1]) {
      options.generatedAt = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return { help: false, ...options };
}

function printHelp() {
  process.stdout.write(
    [
      "Usage: node scripts/extract-stn-regimento.mjs [--input <file>] [--output <file>]",
      "       node scripts/extract-stn-regimento.mjs --generated-at <iso8601>",
      "",
      `Default input:  ${DEFAULT_INPUT}`,
      `Default output: ${DEFAULT_OUTPUT}`,
      "Env override:   STN_GENERATED_AT=<iso8601>",
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

  const html = await readFile(args.input, "utf8");
  const extracted = extractStnStructure(html, path.basename(args.input), {
    generatedAt: args.generatedAt,
  });

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(extracted, null, 2)}\n`, "utf8");

  process.stdout.write(
    [
      `Arquivo gerado: ${args.output}`,
      `Unidades: ${extracted.summary.totalUnidades}`,
      `Competencias: ${extracted.summary.totalCompetencias}`,
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
