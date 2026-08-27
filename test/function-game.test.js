import test from "node:test";
import assert from "node:assert/strict";
import { FunctionWolfGame, MODULUS } from "../function-game.js";

function seeded(seed = 42) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

test("function mode supports one to seven local human players", () => {
  for (let count = 1; count <= 7; count += 1) {
    const game = new FunctionWolfGame({ humanCount: count, rng: seeded(count) });
    assert.equal(game.players.filter((player) => player.human).length, count);
    assert.equal(game.players.filter((player) => player.role === "wolf").length, 1);
    assert.equal(game.players.length, 7);
  }
});

test("every possible composed function collides with another public function", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const game = new FunctionWolfGame({ rng: seeded(seed) });
    for (const player of game.players) {
      const partner = game.collisionPartner(player);
      assert.ok(partner, `${player.name} has no collision partner`);
      for (let input = 0; input < MODULUS; input += 1) {
        assert.equal(game.omega.evaluate(player.baseFunction.evaluate(input)), partner.baseFunction.evaluate(input));
      }
    }
  }
});

test("an attacked citizen survives, remains a citizen and secretly becomes composed", () => {
  const game = new FunctionWolfGame({ humanCount: 7, rng: seeded(9) });
  const target = game.players.find((player) => player.role === "citizen");
  game.resolveNight(target.id);
  assert.equal(target.alive, true);
  assert.equal(target.role, "citizen");
  assert.equal(target.infected, true);
  assert.equal(game.isComposed(target), true);
});

test("the wolf wins when wolf plus attacked citizens exceed half of survivors", () => {
  const game = new FunctionWolfGame({ humanCount: 7, rng: seeded(17) });
  const citizens = game.players.filter((player) => player.role === "citizen");
  game.resolveNight(citizens[0].id);
  game.resolveNight(citizens[1].id);
  assert.equal(game.outcome, null);
  game.resolveNight(citizens[2].id);
  assert.equal(game.outcome.winner, "wolf");
});

test("infected citizens' votes are replaced with the original wolf's target", () => {
  const game = new FunctionWolfGame({ humanCount: 7, rng: seeded(21) });
  const citizens = game.players.filter((player) => player.role === "citizen");
  citizens[0].infected = true;
  citizens[1].infected = true;
  const wolfTarget = citizens[2];
  const votes = new Map(game.players.map((player) => [player.id, "none"]));
  votes.set(game.wolf.id, wolfTarget.id);
  votes.set(citizens[0].id, citizens[3].id);
  votes.set(citizens[1].id, citizens[4].id);
  const result = game.resolveVotes(votes);
  assert.equal(result.votes.find((vote) => vote.voterId === citizens[0].id).choice, wolfTarget.id);
  assert.equal(result.votes.find((vote) => vote.voterId === citizens[1].id).choice, wolfTarget.id);
});

test("citizens win immediately by exiling the original wolf", () => {
  const game = new FunctionWolfGame({ humanCount: 7, rng: seeded(31) });
  const votes = new Map(game.players.map((player) => [player.id, game.wolf.id]));
  votes.set(game.wolf.id, "none");
  game.resolveVotes(votes);
  assert.equal(game.wolf.alive, false);
  assert.equal(game.outcome.winner, "citizen");
});

test("a unanimous no-exile vote removes nobody", () => {
  const game = new FunctionWolfGame({ humanCount: 7, rng: seeded(37) });
  const votes = new Map(game.players.map((player) => [player.id, "none"]));
  const result = game.resolveVotes(votes);
  assert.equal(result.exiled, null);
  assert.equal(game.alivePlayers().length, 7);
});

test("CPU observations update private suspicion without exposing infection", () => {
  const game = new FunctionWolfGame({ humanCount: 1, rng: seeded(45) });
  const pair = game.players
    .filter((player) => !player.human && player.role === "citizen")
    .flatMap((observer) => game.players
      .filter((target) => target.id !== observer.id && target.role === "citizen")
      .map((target) => ({ observer, target })))
    .find(({ observer, target }) => {
      const input = observer.condition.input;
      const base = observer.condition.observe(target.baseFunction.evaluate(input));
      const composed = observer.condition.observe(game.omega.evaluate(target.baseFunction.evaluate(input)));
      return base.key !== composed.key;
    });
  assert.ok(pair);
  const { observer, target } = pair;
  const before = game.suspicions.get(observer.id).get(target.id);
  target.infected = true;
  game.investigate(observer.id, target.id);
  const after = game.suspicions.get(observer.id).get(target.id);
  assert.equal(target.role, "citizen");
  assert.ok(after >= 0.005 && after <= 0.995);
  assert.notEqual(after, before);
});

test("seeded mixed human/CPU games can progress to a valid outcome", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const game = new FunctionWolfGame({ humanCount: 1 + (seed % 4), rng: seeded(seed) });
    for (let round = 0; round < 10 && !game.outcome; round += 1) {
      for (const human of game.getHumanActors()) {
        const target = game.alivePlayers().find((player) => player.id !== human.id);
        const report = game.investigate(human.id, target.id);
        game.publishReport(report, true);
      }
      game.runCpuInvestigations();
      const humanVotes = new Map();
      for (const human of game.getHumanActors()) {
        const target = game.alivePlayers().find((player) => player.id !== human.id);
        humanVotes.set(human.id, human.role === "wolf" ? target.id : "none");
      }
      game.resolveVotes(humanVotes);
      if (game.outcome) break;
      const nightTarget = game.alivePlayers().find((player) => player.role !== "wolf" && !player.infected);
      game.resolveNight(nightTarget?.id);
      if (!game.outcome) game.startNextRound();
    }
    assert.ok(game.outcome);
    assert.ok(["citizen", "wolf"].includes(game.outcome.winner));
  }
});
