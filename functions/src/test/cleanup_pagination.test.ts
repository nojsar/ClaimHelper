import assert from "node:assert/strict";
import test from "node:test";

import { DocumentData, Query } from "firebase-admin/firestore";

import { forEachCleanupPage } from "../cleanup";

type FakeDoc = { id: string; index: number };

class FakeQuery {
  constructor(
    private readonly docs: FakeDoc[],
    private readonly offset = 0,
    private readonly pageLimit = docs.length,
  ) {}

  limit(value: number): FakeQuery {
    return new FakeQuery(this.docs, this.offset, value);
  }

  startAfter(cursor: FakeDoc): FakeQuery {
    return new FakeQuery(this.docs, cursor.index + 1, this.pageLimit);
  }

  async get(): Promise<{ empty: boolean; size: number; docs: FakeDoc[] }> {
    const docs = this.docs.slice(this.offset, this.offset + this.pageLimit);
    return { empty: docs.length === 0, size: docs.length, docs };
  }
}

test("cleanup pagination drains multiple pages", async () => {
  const docs = Array.from({ length: 235 }, (_, index) => ({
    id: String(index),
    index,
  }));
  const handled: string[] = [];
  const result = await forEachCleanupPage(
    new FakeQuery(docs) as unknown as Query<DocumentData>,
    100,
    500,
    Date.now() + 10_000,
    async (doc) => {
      handled.push(doc.id);
    },
  );
  assert.equal(result.processed, 235);
  assert.equal(result.capped, false);
  assert.equal(handled.length, 235);
});

test("cleanup pagination stops at configured cap", async () => {
  const docs = Array.from({ length: 500 }, (_, index) => ({
    id: String(index),
    index,
  }));
  const result = await forEachCleanupPage(
    new FakeQuery(docs) as unknown as Query<DocumentData>,
    50,
    120,
    Date.now() + 10_000,
    async () => undefined,
  );
  assert.equal(result.processed, 120);
  assert.equal(result.capped, true);
});
