import assert from "node:assert/strict";
import test from "node:test";

import { resolveApplyRoute } from "./run-stn-import-apply.mjs";

test("resolveApplyRoute resolves new company route", () => {
  assert.equal(resolveApplyRoute("new_company", null), "/api/companies/import");
});

test("resolveApplyRoute resolves existing company route", () => {
  assert.equal(
    resolveApplyRoute("existing_company", "company-123"),
    "/api/companies/company-123/imports/apply",
  );
});
