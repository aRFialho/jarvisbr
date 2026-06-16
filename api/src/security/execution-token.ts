import crypto from "node:crypto";

export function createRawExecutionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashExecutionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
