import { maxWithRandomTie } from "./probability.js";

export function chooseCpuVote(game, voter) {
  const targets = game.alivePlayers().filter((target) => target.id !== voter.id);
  const map = game.suspicions.get(voter.id);
  const target = maxWithRandomTie(targets, (candidate) => map.get(candidate.id), game.rng);
  return map.get(target.id) >= 0.3 ? target.id : "none";
}

export function chooseWolfVote(game) {
  const targets = game.alivePlayers().filter((target) => target.role !== "wolf" && !target.infected);
  if (!targets.length) return "none";
  const humansFirst = targets.filter((target) => target.human);
  const pool = humansFirst.length && game.rng() < 0.62 ? humansFirst : targets;
  return pool[Math.floor(game.rng() * pool.length)].id;
}

export function resolveVotes(game, humanVotes = new Map()) {
  const alive = game.alivePlayers();
  const primaryWolf = game.primaryWolf ?? game.wolf;
  let wolfChoice = primaryWolf?.human ? humanVotes.get(primaryWolf.id) : chooseWolfVote(game);
  if (!wolfChoice || game.wolves.some((wolf) => wolf.id === wolfChoice)) wolfChoice = "none";
  const votes = [];
  for (const voter of alive) {
    let choice;
    if (voter.role === "wolf") choice = wolfChoice;
    else if (voter.human) choice = humanVotes.get(voter.id) ?? "none";
    else choice = chooseCpuVote(game, voter);
    if (voter.infected) choice = wolfChoice;
    if (choice === voter.id || (choice !== "none" && !alive.some((target) => target.id === choice))) choice = "none";
    votes.push({ voterId: voter.id, choice });
  }
  const tally = new Map([["none", 0]]);
  for (const vote of votes) tally.set(vote.choice, (tally.get(vote.choice) ?? 0) + 1);
  const winner = maxWithRandomTie([...tally.keys()], (choice) => tally.get(choice), game.rng);
  let exiled = null;
  if (winner !== "none") {
    exiled = game.players.find((player) => player.id === winner);
    exiled.alive = false;
  }
  game.lastVote = { votes, tally, exiled };
  game.checkOutcome(exiled);
  game.phase = game.outcome ? "ended" : "night";
  return game.lastVote;
}
