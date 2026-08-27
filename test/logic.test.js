import test from "node:test";
import assert from "node:assert/strict";
import { atom, binary, checkNewStatement, isConsistent, not } from "../logic.js";

const players = Array.from({ length: 7 }, (_, index) => ({ id: `p${index}`, name: `P${index}` }));

test("a direct contradiction is rejected", () => {
  const claim = atom("wolf", "p1");
  const verdict = checkNewStatement(players, [claim], not(claim));
  assert.equal(verdict.consistent, false);
  assert.deepEqual(verdict.conflictIndexes, [0]);
});

test("an inference-level modus ponens contradiction is rejected", () => {
  const p = atom("wolf", "p1");
  const q = atom("seer", "p2");
  const history = [binary("implies", p, q), p];
  const verdict = checkNewStatement(players, history, not(q));
  assert.equal(verdict.consistent, false);
  assert.deepEqual(verdict.conflictIndexes, [0, 1]);
});

test("compatible implications remain satisfiable", () => {
  const p = atom("wolf", "p1");
  const q = atom("seer", "p2");
  assert.equal(isConsistent(players, [binary("implies", p, q), not(p), not(q)]), true);
});

test("the citizen-side predicate contradicts being a wolf", () => {
  const formulas = [atom("wolf", "p3"), atom("citizen", "p3")];
  assert.equal(isConsistent(players, formulas), false);
});

test("seer and guardian claims both imply the citizen-side predicate", () => {
  assert.equal(isConsistent(players, [atom("seer", "p3"), atom("citizen", "p3")]), true);
  assert.equal(isConsistent(players, [atom("guardian", "p4"), atom("citizen", "p4")]), true);
  assert.equal(isConsistent(players, [atom("seer", "p3"), not(atom("citizen", "p3"))]), false);
});

test("a person still cannot hold two occupational roles", () => {
  assert.equal(isConsistent(players, [atom("seer", "p3"), atom("guardian", "p3")]), false);
});

test("the village cannot have two wolves", () => {
  const formulas = [atom("wolf", "p3"), atom("wolf", "p4")];
  assert.equal(isConsistent(players, formulas), false);
});

test("biconditional encoding catches unequal truth values", () => {
  const p = atom("wolf", "p1");
  const q = atom("seer", "p2");
  assert.equal(isConsistent(players, [binary("iff", p, q), p, not(q)]), false);
});
