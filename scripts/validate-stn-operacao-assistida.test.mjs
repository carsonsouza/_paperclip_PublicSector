import assert from "node:assert/strict";
import test from "node:test";

import { buildOperacaoAssistidaReport } from "./validate-stn-operacao-assistida.mjs";

test("buildOperacaoAssistidaReport returns ready for mapped governance and indicators", () => {
  const structure = {
    units: [
      { nome: "Secretaria do Tesouro Nacional", sigla: "STN", level: 1, parentSigla: null, competencias: [] },
      { nome: "Subsecretaria de Gestão Fiscal", sigla: "SUGEF", level: 2, parentSigla: "STN", competencias: [] },
    ],
  };
  const report = buildOperacaoAssistidaReport({
    structure,
    pilotSiglas: ["SUGEF"],
    approvalMap: {
      units: {
        SUGEF: { reviewerUserId: "sugef.revisor@tesouro.gov.br", approverUserId: "sugef.subsecretario@tesouro.gov.br" },
      },
    },
    indicatorsMap: {
      global: [{ id: "prazo", name: "Prazo", periodicity: "mensal" }],
    },
    userCatalog: {
      userIds: ["sugef.revisor@tesouro.gov.br", "sugef.subsecretario@tesouro.gov.br"],
    },
    visualIdentity: {
      source: {
        document: "Manual de Identidade Visual da STN",
      },
    },
  });

  assert.equal(report.status, "ready");
  assert.equal(report.summary.topUnits, 1);
  assert.equal(report.summary.unresolvedUserRefs, 0);
  assert.equal(report.summary.unitsWithoutIndicators, 0);
  assert.equal(report.summary.visualIdentityConfigured, true);
});

test("buildOperacaoAssistidaReport warns when indicator is missing", () => {
  const structure = {
    units: [
      { nome: "Secretaria do Tesouro Nacional", sigla: "STN", level: 1, parentSigla: null, competencias: [] },
      { nome: "Subsecretaria de Administração Financeira Federal", sigla: "SUAFI", level: 2, parentSigla: "STN", competencias: [] },
    ],
  };
  const report = buildOperacaoAssistidaReport({
    structure,
    pilotSiglas: ["SUAFI"],
    approvalMap: null,
    indicatorsMap: { global: [] },
    userCatalog: null,
    visualIdentity: {
      source: {
        document: "Manual de Identidade Visual da STN",
      },
    },
  });

  assert.equal(report.status, "attention_needed");
  assert.equal(report.summary.unitsWithoutIndicators, 1);
  assert.match(report.warnings[0], /sem indicadores operacionais/);
});

test("buildOperacaoAssistidaReport supports deterministic generatedAt", () => {
  const structure = {
    units: [
      { nome: "Secretaria do Tesouro Nacional", sigla: "STN", level: 1, parentSigla: null, competencias: [] },
      { nome: "Subsecretaria de Gestão Fiscal", sigla: "SUGEF", level: 2, parentSigla: "STN", competencias: [] },
    ],
  };
  const report = buildOperacaoAssistidaReport({
    structure,
    pilotSiglas: ["SUGEF"],
    approvalMap: null,
    indicatorsMap: { global: [{ id: "kpi", name: "KPI", periodicity: "mensal" }] },
    userCatalog: null,
    visualIdentity: {
      source: {
        document: "Manual de Identidade Visual da STN",
      },
    },
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(report.generatedAt, "2026-01-01T00:00:00.000Z");
});

test("buildOperacaoAssistidaReport warns when visual identity is missing", () => {
  const structure = {
    units: [
      { nome: "Secretaria do Tesouro Nacional", sigla: "STN", level: 1, parentSigla: null, competencias: [] },
      { nome: "Subsecretaria de Gestão Fiscal", sigla: "SUGEF", level: 2, parentSigla: "STN", competencias: [] },
    ],
  };
  const report = buildOperacaoAssistidaReport({
    structure,
    pilotSiglas: ["SUGEF"],
    approvalMap: {
      units: {
        SUGEF: { reviewerUserId: "sugef.revisor@tesouro.gov.br", approverUserId: "sugef.subsecretario@tesouro.gov.br" },
      },
    },
    indicatorsMap: {
      global: [{ id: "prazo", name: "Prazo", periodicity: "mensal" }],
    },
    userCatalog: {
      userIds: ["sugef.revisor@tesouro.gov.br", "sugef.subsecretario@tesouro.gov.br"],
    },
    visualIdentity: null,
  });

  assert.equal(report.status, "attention_needed");
  assert.equal(report.summary.visualIdentityConfigured, false);
  assert.match(report.warnings[0], /identidade visual/i);
});
