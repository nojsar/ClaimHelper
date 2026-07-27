import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteOwnedCasePages,
  OwnedCaseDeletionTarget,
} from "../cases";

function target(id: string): OwnedCaseDeletionTarget {
  return { id, storageOwnerUids: [`owner-${id}`] };
}

test("account deletion drains bounded pages until no cases remain", async () => {
  const remaining = ["a", "b", "c", "d", "e", "f", "g"].map(target);
  const requestedLimits: number[] = [];
  const deleted: string[] = [];

  const count = await deleteOwnedCasePages(
    async (limit) => {
      requestedLimits.push(limit);
      return remaining.slice(0, limit);
    },
    async (item) => {
      deleted.push(item.id);
      const index = remaining.findIndex((candidate) => candidate.id === item.id);
      remaining.splice(index, 1);
    },
    3,
  );

  assert.equal(count, 7);
  assert.deepEqual(deleted.sort(), ["a", "b", "c", "d", "e", "f", "g"]);
  assert.deepEqual(requestedLimits, [3, 3, 3, 3]);
  assert.deepEqual(remaining, []);
});

test("account deletion stops on a failed case so a retry can resume safely", async () => {
  const remaining = ["a", "b", "c"].map(target);

  await assert.rejects(
    deleteOwnedCasePages(
      async (limit) => remaining.slice(0, limit),
      async (item) => {
        if (item.id === "b") throw new Error("storage unavailable");
        const index = remaining.findIndex((candidate) => candidate.id === item.id);
        remaining.splice(index, 1);
      },
      2,
    ),
    /storage unavailable/,
  );

  assert.deepEqual(remaining.map((item) => item.id), ["b", "c"]);
});

test("account deletion rejects an invalid page size", async () => {
  await assert.rejects(
    deleteOwnedCasePages(async () => [], async () => undefined, 0),
    /positive integer/,
  );
});
