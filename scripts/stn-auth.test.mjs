import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthHeaders, resolveAuthToken } from "./stn-auth.mjs";

test("resolveAuthToken prefers inline token", () => {
  process.env.PAPERCLIP_TOKEN = "env-token";
  const token = resolveAuthToken({ token: "inline-token", tokenEnvVar: "PAPERCLIP_TOKEN" });
  assert.equal(token, "inline-token");
});

test("resolveAuthToken uses env token when inline not provided", () => {
  process.env.PAPERCLIP_TOKEN = "env-token";
  const token = resolveAuthToken({ token: "", tokenEnvVar: "PAPERCLIP_TOKEN" });
  assert.equal(token, "env-token");
});

test("resolveAuthToken returns null when noAuth is enabled", () => {
  process.env.PAPERCLIP_TOKEN = "env-token";
  const token = resolveAuthToken({ noAuth: true, tokenEnvVar: "PAPERCLIP_TOKEN" });
  assert.equal(token, null);
});

test("buildAuthHeaders emits Authorization when token resolved", () => {
  const headers = buildAuthHeaders({ token: "abc123" });
  assert.equal(headers.Authorization, "Bearer abc123");
});
