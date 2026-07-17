import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettlementProof } from "./keeper.js";

const hash = Buffer.alloc(32, 7).toString("base64");

function proof() {
  return {
    summary: {
      fixtureId: 18_175_981,
      updateStats: {
        updateCount: 4,
        minTimestamp: 1_782_000_000_000,
        maxTimestamp: 1_782_000_000_999,
      },
      eventStatsSubTreeRoot: hash,
    },
    subTreeProof: [],
    mainTreeProof: [],
    eventStatRoot: hash,
    statsToProve: [
      { key: 1, value: 2, period: 100 },
      { key: 2, value: 1, period: 100 },
    ],
    statProofs: [[], []],
  };
}

test("normalizes the official TxLINE V2 score proof shape", () => {
  const normalized = normalizeSettlementProof(proof(), "18175981");
  assert.equal(normalized.fixtureSummary.fixtureId.toString(), "18175981");
  assert.equal(normalized.fixtureSummary.updateStats.updateCount, 4);
  assert.equal(normalized.stats[0].stat.key, 1);
  assert.equal(normalized.stats[1].stat.key, 2);
  assert.equal(normalized.stats[0].stat.period, 100);
  assert.deepEqual(normalized.eventStatRoot, Array(32).fill(7));
});

test("rejects a proof for a different fixture", () => {
  assert.throws(
    () => normalizeSettlementProof(proof(), "999"),
    /fixture does not match/i,
  );
});

test("rejects an incomplete proof", () => {
  assert.throws(
    () => normalizeSettlementProof({ summary: {} }, "18175981"),
    /incomplete V2 settlement proof/i,
  );
});

test("rejects non-final or reordered score stats", () => {
  const wrongPeriod = proof();
  wrongPeriod.statsToProve[1].period = 2;
  assert.throws(
    () => normalizeSettlementProof(wrongPeriod, "18175981"),
    /final period 100/i,
  );

  const wrongOrder = proof();
  wrongOrder.statsToProve.reverse();
  assert.throws(
    () => normalizeSettlementProof(wrongOrder, "18175981"),
    /ordered as keys 1 and 2/i,
  );
});
