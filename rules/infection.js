import { weightedChoice } from "./probability.js";

export function resolveNight(game, targetId = null) {
  if (!game.wolf.alive) return null;
  const candidates = game.alivePlayers().filter((player) => player.role !== "wolf" && !player.infected);
  if (!candidates.length) {
    game.checkOutcome();
    return null;
  }
  let target = candidates.find((player) => player.id === targetId);
  if (!target) target = weightedChoice(candidates, (candidate) => candidate.human ? 1.6 : 1, game.rng);
  target.infected = true;
  game.attackHistory.push(target.id);
  game.lastAttack = { targetId: target.id, round: game.round };
  game.checkOutcome();
  game.phase = game.outcome ? "ended" : "night-result";
  return { attacked: true, outcome: game.outcome };
}

