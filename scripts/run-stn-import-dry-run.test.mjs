import assert from "node:assert/strict";
import test from "node:test";

import { resolvePreviewRoute } from "./run-stn-import-dry-run.mjs";

test("resolvePreviewRoute resolves new company route", () => {
  assert.equal(resolvePreviewRoute("new_company", null), "/api/companies/import/preview");
});

test("resolvePreviewRoute resolves existing company route", () => {
  assert.equal(
    resolvePreviewRoute("existing_company", "company-123"),
    "/api/companies/company-123/imports/preview",
  );
});
