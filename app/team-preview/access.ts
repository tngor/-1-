import "server-only";
import { createHash } from "node:crypto";

export const trialCookie = "mission_team_trial";
const expectedHash = "80038c901e13722870f55090786ae7d76e9efc7e5b277e16936b916ded1aab44";

export function allowsTrial(value: unknown) {
  if (typeof value !== "string" || value.length > 128 || !value) return false;
  return createHash("sha256").update(value.trim()).digest("hex") === expectedHash;
}
