import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertConfirmedAction,
  ConfirmationExpiredError,
  ConfirmationRequiredError
} from "../src/security/confirmation-guard.js";

const base = {
  id: "confirmation-1",
  userId: "user-1",
  commandId: "command-1",
  expiresAt: new Date("2026-06-16T12:05:00Z")
};

describe("confirmation guard", () => {
  it("blocks when confirmation is missing", () => {
    assert.throws(() => {
      assertConfirmedAction({
        confirmation: null,
        userId: "user-1",
        commandId: "command-1",
        now: new Date("2026-06-16T12:00:00Z")
      });
    }, ConfirmationRequiredError);
  });

  it("blocks pending confirmations", () => {
    assert.throws(() => {
      assertConfirmedAction({
        confirmation: { ...base, status: "pending", confirmedAt: null },
        userId: "user-1",
        commandId: "command-1",
        now: new Date("2026-06-16T12:00:00Z")
      });
    }, ConfirmationRequiredError);
  });

  it("blocks expired confirmations", () => {
    assert.throws(() => {
      assertConfirmedAction({
        confirmation: {
          ...base,
          status: "confirmed",
          confirmedAt: new Date("2026-06-16T12:00:00Z")
        },
        userId: "user-1",
        commandId: "command-1",
        now: new Date("2026-06-16T12:06:00Z")
      });
    }, ConfirmationExpiredError);
  });

  it("allows confirmed, matching, unexpired actions", () => {
    assert.equal(
      assertConfirmedAction({
        confirmation: {
          ...base,
          status: "confirmed",
          confirmedAt: new Date("2026-06-16T12:00:00Z")
        },
        userId: "user-1",
        commandId: "command-1",
        now: new Date("2026-06-16T12:01:00Z")
      }),
      true
    );
  });
});
