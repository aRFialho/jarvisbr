import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAssistantReply } from "../src/ai/conversation.service.js";

describe("local conversation layer", () => {
  it("answers greetings without suggesting file actions", () => {
    const result = buildAssistantReply("Oi Jarvis", { assistantName: "Jarvis" });

    assert.match(result.reply, /Posso conversar/);
    assert.equal(result.memoryWrite, undefined);
  });

  it("solves simple arithmetic locally", () => {
    const result = buildAssistantReply("quanto e (2 + 3) * 4?");

    assert.equal(result.reply, "O resultado e 20.");
  });

  it("extracts approved learning statements", () => {
    const result = buildAssistantReply("aprenda que eu prefiro respostas curtas");

    assert.equal(result.memoryWrite?.memoryType, "user_fact");
    assert.equal(result.memoryWrite?.content, "eu prefiro respostas curtas");
  });
});
