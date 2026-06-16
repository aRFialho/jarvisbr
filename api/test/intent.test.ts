import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretCommand } from "../src/commands/intent.js";

describe("command interpretation", () => {
  it("extracts the required logo azul flow", () => {
    const interpreted = interpretCommand(
      "Jarvis, no computador Casa tem uma imagem chamada logo azul. Baixe ela para mim.",
      [{ id: "device-1", friendly_name: "Casa", device_type: "desktop" }]
    );

    assert.equal(interpreted.intent, "file.download");
    assert.equal(interpreted.targetDeviceId, "device-1");
    assert.equal(interpreted.requestedKind, "image");
    assert.match(interpreted.query, /logo azul/);
  });
});
