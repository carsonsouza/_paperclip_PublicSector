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
  assert.ok(files[".paperclip.yaml"]);

  assert.match(files["agents/sugef/AGENTS.md"], /reportsTo: "stn"/);
  assert.match(files["agents/gecon/AGENTS.md"], /reportsTo: "sugef"/);
  assert.match(files["agents/stn/AGENTS.md"], /name: "STN"/);
  assert.match(files[".paperclip.yaml"], /executionPolicy:/);
  assert.match(files[".paperclip.yaml"], /competencyRef:/);
  assert.match(files[".paperclip.yaml"], /operationalIndicators:/);
  assert.doesNotMatch(files[".paperclip.yaml"], /board-user/);
});

test("generateTemplateFiles can generate a pilot subset preserving hierarchy", () => {
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
      {
        nome: "Subsecretaria de Administração Financeira Federal",
        sigla: "SUAFI",
        level: 2,
        parentSigla: "STN",
        competencias: [{ code: "I", text: "Competencia SUAFI." }],
      },
    ],
  };

  const files = generateTemplateFiles(structure, { pilotSiglas: ["SUGEF"] });

  assert.ok(files["agents/stn/AGENTS.md"]);
  assert.ok(files["agents/sugef/AGENTS.md"]);
  assert.ok(files["agents/gecon/AGENTS.md"]);
  assert.equal(files["agents/suafi/AGENTS.md"], undefined);
  assert.ok(files["projects/operacao-sugef/PROJECT.md"]);
  assert.equal(files["projects/operacao-suafi/PROJECT.md"], undefined);
  assert.match(files[".paperclip.yaml"], /plano-competencias-sugef:/);
  assert.doesNotMatch(files[".paperclip.yaml"], /plano-competencias-suafi:/);
});

test("generateTemplateFiles applies approval map per unidade", () => {
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
    ],
  };

  const files = generateTemplateFiles(structure, {
    approvalMap: {
      global: {
        reviewerUserId: "global.revisor@tesouro.gov.br",
        approverUserId: "global.aprovador@tesouro.gov.br",
      },
      units: {
        SUGEF: {
          reviewerUserId: "sugef.revisor@tesouro.gov.br",
          approverUserId: "sugef.aprovador@tesouro.gov.br",
        },
      },
    },
  });

  assert.match(files[".paperclip.yaml"], /sugef\.revisor@tesouro\.gov\.br/);
  assert.match(files[".paperclip.yaml"], /sugef\.aprovador@tesouro\.gov\.br/);
  assert.doesNotMatch(files[".paperclip.yaml"], /global\.revisor@tesouro\.gov\.br/);
});

test("generateTemplateFiles applies operational indicators map", () => {
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
    ],
  };

  const files = generateTemplateFiles(structure, {
    indicatorsMap: {
      global: [
        { id: "global-kpi", name: "Global KPI", periodicity: "mensal", formula: "x/y" },
      ],
      units: {
        SUGEF: [
          { id: "sugef-kpi", name: "SUGEF KPI", periodicity: "mensal", formula: "a/b" },
        ],
      },
    },
  });

  assert.match(files[".paperclip.yaml"], /global-kpi/);
  assert.match(files[".paperclip.yaml"], /sugef-kpi/);
});

test("generateTemplateFiles includes visual identity metadata when provided", () => {
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
    ],
  };

  const files = generateTemplateFiles(structure, {
    visualIdentity: {
      source: {
        document: "Manual de Identidade Visual da STN",
      },
      branding: {
        colors: {
          yellow: {
            pantone: "116",
          },
        },
      },
    },
  });

  assert.match(files[".paperclip.yaml"], /publicSector:/);
  assert.match(files[".paperclip.yaml"], /visualIdentity:/);
  assert.match(files[".paperclip.yaml"], /Manual de Identidade Visual da STN/);
  assert.match(files[".paperclip.yaml"], /pantone: "116"/);
});
