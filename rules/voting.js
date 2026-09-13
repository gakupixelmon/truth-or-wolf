import { maxWithRandomTie } from "./probability.js";

function asCandidateSet(candidateIds) {
  if (candidateIds === null || candidateIds === undefined) return null;
  return new Set(candidateIds);
}

export function chooseCpuVote(game, voter, { candidateIds = null, forceCandidate = false } = {}) {
  const candidates = asCandidateSet(candidateIds);
  let targets = game.alivePlayers().filter((target) => target.id !== voter.id);
  if (candidates) targets = targets.filter((target) => candidates.has(target.id));
  if (!targets.length) return "none";
  const map = game.suspicions.get(voter.id);
  const target = maxWithRandomTie(targets, (candidate) => map.get(candidate.id), game.rng);
  return forceCandidate || map.get(target.id) >= 0.3 ? target.id : "none";
}

export function chooseWolfVote(game, { candidateIds = null } = {}) {
  const candidates = asCandidateSet(candidateIds);
  let targets = game.alivePlayers().filter((target) => target.role !== "wolf" && !target.infected);
  if (candidates) targets = targets.filter((target) => candidates.has(target.id));
  if (!targets.length) return "none";
  const humansFirst = targets.filter((target) => target.human);
  const pool = humansFirst.length && game.rng() < 0.62 ? humansFirst : targets;
  return pool[Math.floor(game.rng() * pool.length)].id;
}

function topPlayerChoices(tally) {
  const entries = [...tally.entries()].filter(([choice]) => choice !== "none");
  if (!entries.length) return { maxVotes: 0, choices: [] };
  const maxVotes = Math.max(...entries.map(([, count]) => count));
  return {
    maxVotes,
    choices: entries.filter(([, count]) => count === maxVotes).map(([choice]) => choice),
  };
}

export function resolveVotes(game, humanVotes = new Map(), { candidateIds = null, runoff = false } = {}) {
  const alive = game.alivePlayers();
  const candidates = asCandidateSet(candidateIds);
  const primaryWolf = game.primaryWolf ?? game.wolf;
  let wolfChoice = primaryWolf?.human
    ? humanVotes.get(primaryWolf.id)
    : chooseWolfVote(game, { candidateIds: candidates });
  if (!wolfChoice || game.wolves.some((wolf) => wolf.id === wolfChoice)) wolfChoice = "none";
  const votes = [];
  for (const voter of alive) {
    let choice;
    if (voter.role === "wolf") choice = wolfChoice;
    else if (voter.human) choice = humanVotes.get(voter.id) ?? "none";
    else choice = chooseCpuVote(game, voter, { candidateIds: candidates, forceCandidate: runoff });
    if (voter.infected) choice = wolfChoice;
    const validTarget = choice !== "none"
      && alive.some((target) => target.id === choice && target.id !== voter.id)
      && (!candidates || candidates.has(choice));
    if (choice === voter.id || (choice !== "none" && !validTarget)) choice = "none";
    votes.push({ voterId: voter.id, choice });
  }
  const tally = new Map([["none", 0]]);
  for (const vote of votes) tally.set(vote.choice, (tally.get(vote.choice) ?? 0) + 1);

  const { maxVotes, choices: topChoices } = topPlayerChoices(tally);
  const noneVotes = tally.get("none") ?? 0;
  // 初回投票で複数人が最多票なら、その候補だけで再投票する。
  // 「追放しない」は再投票の候補に含めず、同数候補の人だけを残す。
  if (!runoff && topChoices.length > 1 && maxVotes >= noneVotes) {
    game.lastVote = { votes, tally, exiled: null, needsRunoff: true, runoffCandidates: topChoices };
    game.phase = "vote";
    return game.lastVote;
  }

  let winner;
  if (runoff && candidates) {
    const runoffEntries = topChoices.filter((choice) => candidates.has(choice));
    if (!runoffEntries.length) winner = "none";
    else winner = maxWithRandomTie(runoffEntries, (choice) => tally.get(choice), game.rng);
  } else {
    winner = maxWithRandomTie([...tally.keys()], (choice) => tally.get(choice), game.rng);
  }
  let exiled = null;
  if (winner !== "none") {
    exiled = game.players.find((player) => player.id === winner);
    exiled.alive = false;
  }
  game.lastVote = { votes, tally, exiled, runoff };
  game.checkOutcome(exiled);
  game.phase = game.outcome ? "ended" : "night";
  return game.lastVote;
}
