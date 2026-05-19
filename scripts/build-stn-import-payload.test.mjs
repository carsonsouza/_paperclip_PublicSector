import assert from "node:assert/strict";
import test from "node:test";

import { buildImportPayload, buildImportRequest } from "./build-stn-import-payload.mjs";

test("buildImportPayload returns ready when required files and docs exist", () => {
  const files = {
    "COMPANY.md": "---\nkind: company\n---\n",
    ".paperclip.yaml": "company:\n  requireBoardApprovalForNewAgents: true\n",
    "agents/sugef/AGENTS.md": "---\nkind: agent\n---\n",
    "projects/operacao-sugef/PROJECT.md": "---\nkind: project\n---\n",
    "tasks/plano-competencias-sugef/TASK.md": "---\nkind: task\n---\n",
  };
  const result = buildImportPayload({
    rootPath: "template-stn-company-pilot",
    files,
    include: { company: true, agents: true, projects: true, issues: true, skills: false },
    target: { mode: "new_company", newCompanyName: "STN Piloto" },
  });

  assert.equal(result.summary.status, "ready");
  assert.equal(result.summary.issues.length, 0);
  assert.equal(result.payload.source.type, "inline");
});

test("buildImportPayload flags missing required files", () => {
  const files = {
    "agents/sugef/AGENTS.md": "---\nkind: agent\n---\n",
  };
  const result = buildImportPayload({
    rootPath: "template-stn-company-pilot",
    files,
    include: { company: true, agents: true, projects: true, issues: true, skills: false },
    target: { mode: "new_company", newCompanyName: "STN Piloto" },
  });

  assert.equal(result.summary.status, "attention_needed");
  assert.ok(result.summary.issues.some((issue) => issue.includes("COMPANY.md")));
  assert.ok(result.summary.issues.some((issue) => issue.includes(".paperclip.yaml")));
});

test("buildImportRequest returns API-ready body", () => {
  const files = {
    "COMPANY.md": "---\nkind: company\n---\n",
    ".paperclip.yaml": "company:\n  requireBoardApprovalForNewAgents: true\n",
    "agents/sugef/AGENTS.md": "---\nkind: agent\n---\n",
    "projects/operacao-sugef/PROJECT.md": "---\nkind: project\n---\n",
    "tasks/plano-competencias-sugef/TASK.md": "---\nkind: task\n---\n",
  };
  const result = buildImportPayload({
    rootPath: "template-stn-company-pilot",
    files,
    include: { company: true, agents: true, projects: true, issues: true, skills: false },
    target: { mode: "new_company", newCompanyName: "STN Piloto" },
  });
  const request = buildImportRequest(result);

  assert.equal(request.source.type, "inline");
  assert.equal(request.target.mode, "new_company");
  assert.equal(request.collisionStrategy, "rename");
});

test("buildImportPayload accepts skip collision strategy", () => {
  const files = {
    "COMPANY.md": "---\nkind: company\n---\n",
    ".paperclip.yaml": "company:\n  requireBoardApprovalForNewAgents: true\n",
    "agents/sugef/AGENTS.md": "---\nkind: agent\n---\n",
    "projects/operacao-sugef/PROJECT.md": "---\nkind: project\n---\n",
    "tasks/plano-competencias-sugef/TASK.md": "---\nkind: task\n---\n",
  };
  const result = buildImportPayload({
    rootPath: "template-stn-company-pilot",
    files,
    include: { company: true, agents: true, projects: true, issues: true, skills: false },
    target: { mode: "existing_company", companyId: "company-123" },
    collisionStrategy: "skip",
  });
  assert.equal(result.payload.collisionStrategy, "skip");
});

test("buildImportPayload rejects invalid collision strategy", () => {
  const files = {
    "COMPANY.md": "---\nkind: company\n---\n",
    ".paperclip.yaml": "company:\n  requireBoardApprovalForNewAgents: true\n",
    "agents/sugef/AGENTS.md": "---\nkind: agent\n---\n",
    "projects/operacao-sugef/PROJECT.md": "---\nkind: project\n---\n",
    "tasks/plano-competencias-sugef/TASK.md": "---\nkind: task\n---\n",
  };
  assert.throws(
    () => buildImportPayload({
      rootPath: "template-stn-company-pilot",
      files,
      include: { company: true, agents: true, projects: true, issues: true, skills: false },
      target: { mode: "new_company", newCompanyName: "STN Piloto" },
      collisionStrategy: "replace",
    }),
    /collision strategy/,
  );
});
