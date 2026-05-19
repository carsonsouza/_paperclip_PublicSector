import assert from "node:assert/strict";
import test from "node:test";

import { generateTemplateFiles } from "./generate-stn-company-template.mjs";

test("generateTemplateFiles creates company, agent, project, and task templates", () => {
  const structure = {
    units: [
      {
        nome: "Secretaria do Tesouro Nacional",
        sigla: "STN",
        level: 1,
        parentSigla: null,
        competencias: [{ code: "I", text: "Competencia STN." }],
      },
      {
        nome: "Subsecretaria de Gestão Fiscal",
        sigla: "SUGEF",
        level: 2,
        parentSigla: "STN",
        competencias: [{ code: "I", text: "Competencia SUGEF." }],
      },
      {
        nome: "Gerencia de Controle",
        sigla: "GECON",
        level: 5,
        parentSigla: "SUGEF",
        competencias: [{ code: "I", text: "Competencia GECON." }],
      },
    ],
  };

  const files = generateTemplateFiles(structure);

  assert.ok(files["COMPANY.md"]);
  assert.ok(files["agents/stn/AGENTS.md"]);
  assert.ok(files["agents/sugef/AGENTS.md"]);
  assert.ok(files["agents/gecon/AGENTS.md"]);
  assert.ok(files["projects/operacao-sugef/PROJECT.md"]);
  assert.ok(files["tasks/plano-competencias-sugef/TASK.md"]);

  assert.match(files["agents/sugef/AGENTS.md"], /reportsTo: "stn"/);
  assert.match(files["agents/gecon/AGENTS.md"], /reportsTo: "sugef"/);
  assert.match(files["agents/stn/AGENTS.md"], /name: "STN"/);
});
