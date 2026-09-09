import { weightedChoice } from "./probability.js";
import { shuffle } from "./functions.js";

/** 人狼が開始時点で知っている「市民側の関数の種類」の一覧。 */
export function knownFunctionOptions(game) {
  if (!game.wolfFunctionOptions) {
    const options = new Map();
    for (const player of game.players.filter((candidate) => candidate.role !== "wolf")) {
      options.set(player.baseFunction.id, { id: player.baseFunction.id, label: player.baseFunction.label });
    }
    // 最初の襲撃時だけ候補の表示順を無作為化し、参加者順から対応を推測できないようにする。
    game.wolfFunctionOptions = shuffle([...options.values()], game.rng);
  }
  return game.wolfFunctionOptions.map((option) => ({ ...option }));
}

function chooseFunctionGuess(game, options) {
  return options[Math.floor(game.rng() * options.length)]?.id ?? null;
}

export function resolveNight(game, targetId = null, functionId = undefined) {
  if (!game.wolf.alive) return null;
  const candidates = game.alivePlayers().filter((player) => player.role !== "wolf" && !player.infected);
  if (!candidates.length) {
    game.checkOutcome();
    return null;
  }
  let target = candidates.find((player) => player.id === targetId);
  if (!target) target = weightedChoice(candidates, (candidate) => candidate.human ? 1.6 : 1, game.rng);
  const options = knownFunctionOptions(game);
  // 明示的な関数指定がない旧APIでは、指定対象の関数を正解として扱う。
  // サーバーのCPU襲撃は対象も省略するため、ここでは秘密の推測を行う。
  const guessedFunctionId = functionId === undefined
    ? (targetId === null ? chooseFunctionGuess(game, options) : target.baseFunction.id)
    : functionId;
  const success = guessedFunctionId === target.baseFunction.id;
  if (success) {
    target.infected = true;
    game.attackHistory.push(target.id);
  }
  game.lastAttack = { targetId: target.id, round: game.round, guessedFunctionId, success };
  game.checkOutcome();
  game.phase = game.outcome ? "ended" : "night-result";
  return { attacked: true, success, outcome: game.outcome };
}
