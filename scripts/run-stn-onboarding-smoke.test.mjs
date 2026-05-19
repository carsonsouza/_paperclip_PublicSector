import assert from "node:assert/strict";
import test from "node:test";

import { buildRequestBodyForTarget, requireApplyConfirmation } from "./run-stn-onboarding-smoke.mjs";

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
