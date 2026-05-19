import assert from "node:assert/strict";
import test from "node:test";

import { buildCurlCommands } from "./generate-stn-import-curl.mjs";

test("buildCurlCommands builds preview/apply routes for new company", () => {
  const commands = buildCurlCommands({
    apiBase: "http://127.0.0.1:3000",
    requestPath: "report/stn/stn-import-request-pilot.json",
    targetMode: "new_company",
    companyId: null,
  });
  assert.match(commands.preview, /\/api\/companies\/import\/preview/);
  assert.match(commands.apply, /\/api\/companies\/import'/);
  assert.match(commands.preview, /\$env:PAPERCLIP_TOKEN/);
});

test("buildCurlCommands builds preview/apply routes for existing company", () => {
  const commands = buildCurlCommands({
    apiBase: "http://127.0.0.1:3000/",
    requestPath: "report/stn/stn-import-request-pilot.json",
    targetMode: "existing_company",
    companyId: "company-123",
  });
  assert.match(commands.preview, /\/api\/companies\/company-123\/imports\/preview/);
  assert.match(commands.apply, /\/api\/companies\/company-123\/imports\/apply/);
});

test("buildCurlCommands can disable auth header", () => {
  const commands = buildCurlCommands({
    apiBase: "http://127.0.0.1:3000/",
    requestPath: "report/stn/stn-import-request-pilot.json",
    targetMode: "new_company",
    companyId: null,
    authEnvVar: null,
  });
  assert.doesNotMatch(commands.preview, /Authorization: Bearer/);
  assert.doesNotMatch(commands.apply, /Authorization: Bearer/);
});
