export function checkOutcome(game, exiled = null) {
  if (exiled?.role === "wolf" || !game.wolf.alive) {
    game.outcome = { winner: "citizen", reason: "元の人狼が追放された。" };
    return game.outcome;
  }
  const alive = game.alivePlayers();
  const wolfSide = alive.filter((player) => player.role === "wolf" || player.infected).length;
  if (wolfSide > alive.length / 2) {
    game.outcome = { winner: "wolf", reason: `人狼と襲撃済み市民が生存者の過半数を超えた（${wolfSide}/${alive.length}）。` };
    return game.outcome;
  }
  return null;
}

