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

  it("does not require a device for conversation", () => {
    const interpreted = interpretCommand("Jarvis, boa noite", [
      { id: "device-1", friendly_name: "Casa", device_type: "desktop" }
    ]);

    assert.equal(interpreted.intent, "conversation");
    assert.equal(interpreted.targetDeviceId, null);
    assert.equal(interpreted.needsDeviceSelection, false);
  });

  it("uses @ device mentions without polluting the file query", () => {
    const interpreted = interpretCommand("Baixe o arquivo logo azul @Casa", [
      { id: "device-1", friendly_name: "Casa", device_type: "desktop" }
    ]);

    assert.equal(interpreted.intent, "file.download");
    assert.equal(interpreted.targetDeviceId, "device-1");
    assert.equal(interpreted.needsDeviceSelection, false);
    assert.equal(interpreted.query, "logo azul");
  });

  it("asks for a device only when a file action has no target", () => {
    const interpreted = interpretCommand("Procure o documento contrato final", []);

    assert.equal(interpreted.intent, "file.search");
    assert.equal(interpreted.targetDeviceId, null);
    assert.equal(interpreted.needsDeviceSelection, true);
  });

  it("keeps general questions as conversation even with search words", () => {
    const interpreted = interpretCommand("Jarvis, procure sobre inteligencia artificial generativa", []);

    assert.equal(interpreted.intent, "conversation");
    assert.equal(interpreted.needsDeviceSelection, false);
  });

  it("does not turn device mentions into file search without a file signal", () => {
    const interpreted = interpretCommand("No computador Casa, o que e React?", [
      { id: "device-1", friendly_name: "Casa", device_type: "desktop" }
    ]);

    assert.equal(interpreted.intent, "conversation");
    assert.equal(interpreted.targetDeviceId, "device-1");
    assert.equal(interpreted.needsDeviceSelection, false);
  });
});
