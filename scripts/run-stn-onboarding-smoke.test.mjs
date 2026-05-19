import assert from "node:assert/strict";
import test from "node:test";

import {
  assertApplyAllowed,
  buildOnboardingExecutionReport,
  buildRequestBodyForTarget,
  requireApplyConfirmation,
  summarizePreviewPlan,
} from "./run-stn-onboarding-smoke.mjs";

test("requireApplyConfirmation rejects apply without yes", () => {
  assert.throws(
    () => requireApplyConfirmation({ apply: true, yes: false }),
    /Apply requer --yes/,
  );
});

test("requireApplyConfirmation accepts preview-only", () => {
  assert.doesNotThrow(() => requireApplyConfirmation({ apply: false, yes: false }));
});

test("buildRequestBodyForTarget keeps original target when no override", () => {
  const request = { target: { mode: "new_company", newCompanyName: "STN" } };
  const result = buildRequestBodyForTarget(request, null);
  assert.deepEqual(result, request);
});

test("buildRequestBodyForTarget overrides target to existing company", () => {
  const request = { target: { mode: "new_company", newCompanyName: "STN" } };
  const result = buildRequestBodyForTarget(request, "company-123");
  assert.deepEqual(result.target, {
    mode: "existing_company",
    companyId: "company-123",
  });
});

test("summarizePreviewPlan aggregates actions into collision counts", () => {
  const summary = summarizePreviewPlan({
    plan: {
      agentPlans: [{ action: "create" }, { action: "update" }, { action: "skip" }],
      projectPlans: [{ action: "create" }, { action: "update" }],
      issuePlans: [{ action: "create" }, { action: "skip" }],
    },
    warnings: ["w1", "w2"],
    errors: [],
  });

  assert.equal(summary.counts.agents.create, 1);
  assert.equal(summary.counts.agents.update, 1);
  assert.equal(summary.counts.agents.skip, 1);
  assert.equal(summary.counts.projects.update, 1);
  assert.equal(summary.counts.issues.skip, 1);
  assert.equal(summary.warnings, 2);
  assert.equal(summary.errors, 0);
  assert.equal(summary.collisions, 4);
});

test("assertApplyAllowed blocks apply when preview has errors", () => {
  assert.throws(
    () => assertApplyAllowed({
      apply: true,
      yes: true,
      previewSummary: { errors: 1, collisions: 0 },
      maxCollisions: null,
    }),
    /preview contém 1 erro\(s\)/,
  );
});

test("assertApplyAllowed blocks apply above collision threshold", () => {
  assert.throws(
    () => assertApplyAllowed({
      apply: true,
      yes: true,
      previewSummary: { errors: 0, collisions: 3 },
      maxCollisions: 2,
    }),
    /acima do limite 2/,
  );
});

test("assertApplyAllowed accepts preview-only mode", () => {
  assert.doesNotThrow(() => assertApplyAllowed({
    apply: false,
    yes: false,
    previewSummary: { errors: 2, collisions: 10 },
    maxCollisions: 0,
  }));
});

test("buildOnboardingExecutionReport returns consolidated execution metadata", () => {
  const report = buildOnboardingExecutionReport({
    apiBase: "http://127.0.0.1:3000",
    previewRoute: "/api/companies/company-123/imports/preview",
    applyRoute: "/api/companies/company-123/imports/apply",
    requestBody: {
      target: { mode: "existing_company", companyId: "company-123" },
      collisionStrategy: "rename",
      include: { company: true, agents: true },
      agents: "all",
    },
    previewSummary: { warnings: 1, errors: 0, collisions: 2 },
    previewPath: "report/stn/stn-import-preview-result.json",
    previewSummaryPath: "report/stn/stn-import-preview-summary.json",
    applyPath: "report/stn/stn-import-apply-result.json",
    applyExecuted: true,
  });

  assert.equal(report.apiBase, "http://127.0.0.1:3000");
  assert.equal(report.routes.preview, "/api/companies/company-123/imports/preview");
  assert.equal(report.routes.apply, "/api/companies/company-123/imports/apply");
  assert.equal(report.request.target.mode, "existing_company");
  assert.equal(report.request.collisionStrategy, "rename");
  assert.equal(report.preview.summary.collisions, 2);
  assert.equal(report.apply.executed, true);
  assert.equal(report.apply.outputFile, "report/stn/stn-import-apply-result.json");
});
