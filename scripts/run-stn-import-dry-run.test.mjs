import assert from "node:assert/strict";
import test from "node:test";

import { applyImportRequestOverrides, resolvePreviewRoute } from "./run-stn-import-dry-run.mjs";

test("resolvePreviewRoute resolves new company route", () => {
  assert.equal(resolvePreviewRoute("new_company", null), "/api/companies/import/preview");
});

test("resolvePreviewRoute resolves existing company route", () => {
  assert.equal(
    resolvePreviewRoute("existing_company", "company-123"),
    "/api/companies/company-123/imports/preview",
  );
});

test("applyImportRequestOverrides sets existing company target override", () => {
  const result = applyImportRequestOverrides(
    { target: { mode: "new_company", newCompanyName: "STN" } },
    { targetCompanyId: "company-123" },
  );
  assert.deepEqual(result.target, { mode: "existing_company", companyId: "company-123" });
});

test("applyImportRequestOverrides sets collision strategy override", () => {
  const result = applyImportRequestOverrides(
    { collisionStrategy: "rename" },
    { collisionStrategy: "skip" },
  );
  assert.equal(result.collisionStrategy, "skip");
});

test("applyImportRequestOverrides rejects invalid collision strategy", () => {
  assert.throws(
    () => applyImportRequestOverrides({ collisionStrategy: "rename" }, { collisionStrategy: "replace" }),
    /--collision-strategy/,
  );
});
