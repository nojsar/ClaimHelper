import assert from "node:assert/strict";
import test from "node:test";

import { decidePaidPacketGeneration } from "../packet";

test("a stored paid packet is always reused", () => {
  const packet = {
    appealLetter: "Stored appeal",
    evidenceChecklist: ["Medical records"],
  };

  assert.deepEqual(decidePaidPacketGeneration(packet), {
    kind: "alreadyExists",
    packet,
  });
});

test("packet generation starts only when no stored packet exists", () => {
  assert.deepEqual(decidePaidPacketGeneration(null), { kind: "generate" });
  assert.deepEqual(decidePaidPacketGeneration(undefined), { kind: "generate" });
});

test("malformed non-object packet values are not treated as completed work", () => {
  assert.deepEqual(decidePaidPacketGeneration("corrupt"), { kind: "generate" });
  assert.deepEqual(decidePaidPacketGeneration([]), { kind: "generate" });
});
