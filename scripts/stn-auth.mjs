export const DEFAULT_TOKEN_ENV_VAR = "PAPERCLIP_TOKEN";

export function resolveAuthToken({ token = null, tokenEnvVar = DEFAULT_TOKEN_ENV_VAR, noAuth = false } = {}) {
  if (noAuth) return null;
  const inlineToken = typeof token === "string" ? token.trim() : "";
  if (inlineToken) return inlineToken;
  const envVar = typeof tokenEnvVar === "string" ? tokenEnvVar.trim() : "";
  if (!envVar) return null;
  const envToken = typeof process.env[envVar] === "string" ? process.env[envVar].trim() : "";
  return envToken || null;
}

export function buildAuthHeaders(options = {}) {
  const token = resolveAuthToken(options);
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`,
  };
}
