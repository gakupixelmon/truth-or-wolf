import test from "node:test";
import assert from "node:assert/strict";
import { AI_RULES, TruthOrWolfGame } from "../game.js";
import { atom, not } from "../logic.js";

function seeded(seed = 42) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

test("a new game always has the requested seven-player role distribution", () => {
  const game = new TruthOrWolfGame(seeded());
  const counts = Object.groupBy
    ? Object.fromEntries(Object.entries(Object.groupBy(game.players, (p) => p.role)).map(([role, list]) => [role, list.length]))
    : game.players.reduce((all, player) => ({ ...all, [player.role]: (all[player.role] ?? 0) + 1 }), {});
  assert.deepEqual(counts, { citizen: 4, guardian: 1, seer: 1, wolf: 1 });
});

test("CPU discussion only emits statements consistent with each speaker history", () => {
  const game = new TruthOrWolfGame(seeded(7));
  const messages = game.runCpuDiscussion();
  assert.ok(messages.length > 0);
  for (const message of messages) {
    assert.ok(game.cpuHistories.get(message.speaker.id).includes(message.formula));
  }
});

test("each CPU owns a normalized and individually different posterior distribution", () => {
  const game = new TruthOrWolfGame(seeded(71));
  const [first, second] = game.players.slice(1, 3);
  const target = game.human;
  const firstBeliefs = game.getRoleBeliefs(first.id, target.id);
  const secondBeliefs = game.getRoleBeliefs(second.id, target.id);
  assert.ok(Math.abs(Object.values(firstBeliefs).reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
  assert.ok(Math.abs(Object.values(secondBeliefs).reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
  assert.notDeepEqual(firstBeliefs, secondBeliefs);
  assert.equal(game.getBelief(first.id, first.id, first.role), 1);
});

test("the same statement produces listener-specific posterior updates", () => {
  const game = new TruthOrWolfGame(seeded(93));
  const listeners = game.players.slice(1).filter((player) => player.role !== "wolf").slice(0, 2);
  const before = listeners.map((listener) => game.getBelief(listener.id, game.human.id, "wolf"));
  game.applyStatementToBeliefs(game.human, atom("wolf", game.human.id));
  const after = listeners.map((listener) => game.getBelief(listener.id, game.human.id, "wolf"));
  assert.ok(after.every((value, index) => value > before[index]));
  assert.notEqual(after[0], after[1]);
});

test("a citizen-side claim lowers wolf probability without selecting a detailed village role", () => {
  const game = new TruthOrWolfGame(seeded(109));
  const listener = game.players.slice(1).find((player) => player.role !== "wolf");
  const target = game.human;
  const before = game.getRoleBeliefs(listener.id, target.id);
  game.applyStatementToBeliefs(target, atom("citizen", target.id));
  const after = game.getRoleBeliefs(listener.id, target.id);
  assert.ok(after.wolf < before.wolf);
  assert.ok(after.seer > 0 && after.guardian > 0 && after.citizen > 0);
});

test("a seer's non-wolf result is expressed as the citizen-side predicate", () => {
  const game = new TruthOrWolfGame(seeded(132));
  const seer = game.players.slice(1).find((player) => player.role === "seer");
  if (!seer) return;
  game.rng = () => 0;
  const formula = game.createVillagerStatement(seer);
  assert.equal(formula.type, "atom");
  assert.equal(formula.role, "citizen");
});

test("a correct claim about a villager weakly raises that villager's seer hypothesis", () => {
  const game = new TruthOrWolfGame(seeded(121));
  const observer = game.players.slice(1).find((player) => player.role === "citizen");
  const speaker = game.players.slice(1).find((player) => player.id !== observer.id);
  const before = game.getBelief(observer.id, speaker.id, "seer");
  game.applyStatementToBeliefs(speaker, not(atom("wolf", observer.id)));
  const after = game.getBelief(observer.id, speaker.id, "seer");
  assert.ok(after > before);
  assert.ok(after < 1);
});

test("the initial divination always produces a non-wolf result without revealing a detailed role", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const game = new TruthOrWolfGame(seeded(seed));
    const seer = game.players.find((player) => player.role === "seer");
    const result = game.seerResults.get(seer.id);
    const target = game.players.find((player) => player.id === result.targetId);
    assert.equal(result.isWolf, false);
    assert.notEqual(target.role, "wolf");
    assert.equal("role" in result, false);
    if (seer.id !== game.human.id) {
      const beliefs = game.getRoleBeliefs(seer.id, target.id);
      assert.equal(beliefs.wolf, 0);
      assert.ok(Object.entries(beliefs).filter(([role, value]) => role !== "wolf" && value > 0).length >= 2);
    }
  }
});

test("confident villagers can probabilistically voice an uncertain abductive hypothesis", () => {
  const game = new TruthOrWolfGame(seeded(44));
  const citizen = game.players.slice(1).find((player) => player.role === "citizen");
  game.rng = () => 0;
  const formula = game.createVillagerStatement(citizen);
  const probability = game.estimateFormulaProbability(citizen.id, formula);
  assert.equal(formula.type, "atom");
  assert.ok(probability >= AI_RULES.speculationMin && probability <= AI_RULES.speculationMax);
});

test("non-wolf CPUs usually state propositions they personally consider likely true", () => {
  let highConfidence = 0;
  let total = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    const game = new TruthOrWolfGame(seeded(seed));
    for (const speaker of game.players.slice(1).filter((player) => player.role !== "wolf")) {
      const formula = game.createVillagerStatement(speaker);
      if (game.estimateFormulaProbability(speaker.id, formula) >= AI_RULES.truthThreshold) highConfidence += 1;
      total += 1;
    }
  }
  assert.ok(highConfidence / total > 0.7);
});

test("every living participant casts one valid vote", () => {
  const game = new TruthOrWolfGame(seeded(19));
  const target = game.players.find((player) => player.id !== game.human.id);
  const livingBefore = game.alivePlayers().length;
  const result = game.vote(target.id);
  assert.equal(result.votes.length, livingBefore);
  assert.equal(result.exile.alive, false);
  assert.equal(result.exile.revealed, true);
});

test("many seeded games can progress through voting and night without invalid targets", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const game = new TruthOrWolfGame(seeded(seed));
    game.runCpuDiscussion();
    const voteTarget = game.alivePlayers().find((player) => player.id !== game.human.id);
    const vote = game.vote(voteTarget.id);
    if (vote.outcome.over) continue;

    const action = game.getNightAction();
    const actionTarget = action.type === "protect"
      ? game.alivePlayers()[0]
      : game.alivePlayers().find((player) => player.id !== game.human.id);
    const night = game.resolveNight(action.type === "sleep" ? null : actionTarget.id);
    assert.ok("outcome" in night);
  }
});
