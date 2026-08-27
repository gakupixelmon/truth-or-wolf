export const MODULUS = 7;

export const FUNCTION_NAMES = ["あなた", "アオイ", "レン", "ミナト", "ユイ", "カイ", "スズ"];

function mod(value) {
  return ((value % MODULUS) + MODULUS) % MODULUS;
}

function shuffle(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function weightedChoice(items, score, rng) {
  const weights = items.map((item) => Math.max(0.001, score(item)));
  let cursor = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}

function makeFunction(id, label, family, evaluate) {
  return { id, label, family, evaluate: (x) => mod(evaluate(mod(x))) };
}

function makeWolfTransform(rng) {
  const candidates = [
    makeFunction("omega-reflect", "Ω(x) = 6 − x (mod 7)", "反転関数", (x) => 6 - x),
    makeFunction("omega-inverse", "Ω(x) = x⁻¹ (mod 7), Ω(0)=0", "逆元関数", (x) => [0, 1, 4, 5, 2, 3, 6][x]),
    makeFunction("omega-swap", "Ω = [1, 0, 3, 2, 5, 4, 6]", "置換関数", (x) => [1, 0, 3, 2, 5, 4, 6][x]),
  ];
  return candidates[Math.floor(rng() * candidates.length)];
}

function makeFunctionDeck(omega, rng) {
  const seedPool = [
    makeFunction("linear-a", "f(x) = x + 1", "一次関数", (x) => x + 1),
    makeFunction("linear-b", "f(x) = 2x + 3", "一次関数", (x) => 2 * x + 3),
    makeFunction("quadratic-a", "f(x) = x² + 2", "二次関数", (x) => x * x + 2),
    makeFunction("quadratic-b", "f(x) = 2x² + x", "二次関数", (x) => 2 * x * x + x),
    makeFunction("cubic-a", "f(x) = x³ + x", "三次関数", (x) => x * x * x + x),
    makeFunction("table-a", "f = [0, 2, 5, 1, 6, 3, 4]", "表関数", (x) => [0, 2, 5, 1, 6, 3, 4][x]),
  ];
  const seeds = shuffle(seedPool, rng).slice(0, 3);
  const deck = [];
  for (const [index, seed] of seeds.entries()) {
    deck.push({ ...seed, id: `base-${index}` });
    deck.push(makeFunction(
      `paired-${index}`,
      `f(x) = Ω(${seed.label.replace("f(x) = ", "")})`,
      `合成${seed.family}`,
      (x) => omega.evaluate(seed.evaluate(x)),
    ));
  }
  const duplicate = deck[0];
  deck.push(makeFunction("echo", duplicate.label, `重複${duplicate.family}`, (x) => duplicate.evaluate(x)));
  return shuffle(deck, rng);
}

function makeCondition(index, rng) {
  const input = Math.floor(rng() * MODULUS);
  const type = ["exact", "parity", "threshold", "set"][index % 4];
  if (type === "exact") {
    return {
      input,
      label: `F(${input}) の値を得る`,
      observe: (value) => ({ key: `=${value}`, display: `F(${input}) = ${value}` }),
    };
  }
  if (type === "parity") {
    return {
      input,
      label: `F(${input}) は偶数か`,
      observe: (value) => ({ key: value % 2 === 0 ? "true" : "false", display: `F(${input}) ∈ {0,2,4,6} は ${value % 2 === 0 ? "⊤" : "⊥"}` }),
    };
  }
  if (type === "threshold") {
    const threshold = 3 + Math.floor(rng() * 3);
    return {
      input,
      label: `F(${input}) ≥ ${threshold} か`,
      observe: (value) => ({ key: value >= threshold ? "true" : "false", display: `F(${input}) ≥ ${threshold} は ${value >= threshold ? "⊤" : "⊥"}` }),
    };
  }
  const residue = Math.floor(rng() * 3);
  const set = [residue, residue + 3, mod(residue + 5)];
  return {
    input,
    label: `F(${input}) ∈ {${set.join(",")}} か`,
    observe: (value) => ({ key: set.includes(value) ? "true" : "false", display: `F(${input}) ∈ {${set.join(",")}} は ${set.includes(value) ? "⊤" : "⊥"}` }),
  };
}

function maxWithRandomTie(items, score, rng) {
  let highest = -Infinity;
  let tied = [];
  for (const item of items) {
    const value = score(item);
    if (value > highest + 1e-9) {
      highest = value;
      tied = [item];
    } else if (Math.abs(value - highest) < 1e-9) tied.push(item);
  }
  return tied[Math.floor(rng() * tied.length)];
}

export class FunctionWolfGame {
  constructor({ humanCount = 1, rng = Math.random } = {}) {
    this.rng = rng;
    this.round = 1;
    this.phase = "investigation";
    this.omega = makeWolfTransform(rng);
    const functions = makeFunctionDeck(this.omega, rng);
    const wolfIndex = Math.floor(rng() * 7);
    this.players = FUNCTION_NAMES.map((defaultName, index) => ({
      id: `p${index}`,
      name: index < humanCount ? (humanCount === 1 ? "あなた" : `プレイヤー${index + 1}`) : defaultName,
      human: index < humanCount,
      role: index === wolfIndex ? "wolf" : "citizen",
      infected: false,
      alive: true,
      baseFunction: functions[index],
      condition: makeCondition(index, rng),
    }));
    this.suspicions = new Map();
    this.reliability = new Map();
    this.publicReports = [];
    this.attackHistory = [];
    this.lastVote = null;
    this.lastAttack = null;
    this.outcome = null;
    this.initializeBeliefs();
  }

  get wolf() {
    return this.players.find((player) => player.role === "wolf");
  }

  alivePlayers() {
    return this.players.filter((player) => player.alive);
  }

  initializeBeliefs() {
    for (const observer of this.players.filter((player) => !player.human)) {
      const distribution = new Map();
      const weights = this.players.map((target) => target.id === observer.id ? 0 : 0.85 + this.rng() * 0.3);
      const total = weights.reduce((sum, value) => sum + value, 0);
      this.players.forEach((target, index) => distribution.set(target.id, weights[index] / total));
      if (observer.role === "wolf") {
        for (const target of this.players) distribution.set(target.id, target.id === observer.id ? 1 : 0);
      }
      this.suspicions.set(observer.id, distribution);
      this.reliability.set(observer.id, new Map(this.players.map((speaker) => [speaker.id, 0.58 + this.rng() * 0.24])));
    }
  }

  isComposed(player) {
    return player.role === "wolf" || player.infected;
  }

  currentValue(player, input) {
    const baseValue = player.baseFunction.evaluate(input);
    return this.isComposed(player) ? this.omega.evaluate(baseValue) : baseValue;
  }

  publicFunctionTable(player) {
    return Array.from({ length: MODULUS }, (_, input) => player.baseFunction.evaluate(input));
  }

  composedFunctionTable(player) {
    return Array.from({ length: MODULUS }, (_, input) => this.omega.evaluate(player.baseFunction.evaluate(input)));
  }

  collisionPartner(player) {
    const composed = this.composedFunctionTable(player).join(",");
    return this.players.find((other) => other.id !== player.id && this.publicFunctionTable(other).join(",") === composed);
  }

  investigate(observerId, targetId) {
    const observer = this.players.find((player) => player.id === observerId && player.alive);
    const target = this.players.find((player) => player.id === targetId && player.alive);
    if (!observer || !target || observer.id === target.id) throw new Error("Invalid investigation target");
    const value = this.currentValue(target, observer.condition.input);
    const observed = observer.condition.observe(value);
    if (!observer.human && observer.role !== "wolf") {
      this.updateSuspicion(observer.id, target.id, observer.condition, observed, 1);
    }
    return { observer, target, condition: observer.condition, observed, truthful: true };
  }

  updateSuspicion(observerId, targetId, condition, observed, trust = 1) {
    const map = this.suspicions.get(observerId);
    if (!map || targetId === observerId) return;
    const target = this.players.find((player) => player.id === targetId);
    const base = condition.observe(target.baseFunction.evaluate(condition.input));
    const composed = condition.observe(this.omega.evaluate(target.baseFunction.evaluate(condition.input)));
    if (base.key === composed.key) return;
    const matchesComposed = observed.key === composed.key;
    const prior = map.get(targetId);
    const reliability = 0.5 + 0.42 * trust;
    const likelihoodComposed = matchesComposed ? reliability : 1 - reliability;
    const likelihoodBase = matchesComposed ? 1 - reliability : reliability;
    const posterior = (prior * likelihoodComposed) /
      (prior * likelihoodComposed + (1 - prior) * likelihoodBase);
    map.set(targetId, Math.min(0.995, Math.max(0.005, posterior)));
  }

  publishReport(report, published = true) {
    if (!published) return null;
    const publicReport = { ...report, round: this.round };
    this.publicReports.push(publicReport);
    for (const listener of this.players.filter((player) => !player.human && player.alive && player.id !== report.observer.id)) {
      if (listener.role === "wolf") continue;
      const trust = this.reliability.get(listener.id).get(report.observer.id);
      this.updateSuspicion(listener.id, report.target.id, report.condition, report.observed, trust);
    }
    return publicReport;
  }

  runCpuInvestigations() {
    const reports = [];
    for (const observer of this.players.filter((player) => !player.human && player.alive)) {
      const targets = this.alivePlayers().filter((target) => target.id !== observer.id);
      const target = observer.role === "wolf"
        ? targets[Math.floor(this.rng() * targets.length)]
        : maxWithRandomTie(targets, (candidate) => {
          const probability = this.suspicions.get(observer.id).get(candidate.id);
          return 1 - Math.abs(0.5 - probability) + this.rng() * 0.08;
        }, this.rng);
      const report = this.investigate(observer.id, target.id);
      if (observer.role === "wolf" && this.rng() < 0.72) {
        const base = observer.condition.observe(target.baseFunction.evaluate(observer.condition.input));
        report.observed = base;
        report.truthful = base.key === observer.condition.observe(this.currentValue(target, observer.condition.input)).key;
      }
      if (this.rng() < 0.82) {
        this.publishReport(report, true);
        reports.push(report);
      }
    }
    return reports;
  }

  getHumanActors() {
    return this.players.filter((player) => player.human && player.alive);
  }

  getAverageSuspicion(targetId) {
    const observers = this.players.filter((player) => !player.human && player.alive && player.role !== "wolf" && player.id !== targetId);
    if (!observers.length) return 1 / Math.max(1, this.alivePlayers().length - 1);
    return observers.reduce((sum, observer) => sum + this.suspicions.get(observer.id).get(targetId), 0) / observers.length;
  }

  chooseCpuVote(voter) {
    const targets = this.alivePlayers().filter((target) => target.id !== voter.id);
    const map = this.suspicions.get(voter.id);
    const target = maxWithRandomTie(targets, (candidate) => map.get(candidate.id), this.rng);
    return map.get(target.id) >= 0.3 ? target.id : "none";
  }

  chooseWolfVote() {
    const targets = this.alivePlayers().filter((target) => target.id !== this.wolf.id && !target.infected);
    if (!targets.length) return "none";
    const humansFirst = targets.filter((target) => target.human);
    const pool = humansFirst.length && this.rng() < 0.62 ? humansFirst : targets;
    return pool[Math.floor(this.rng() * pool.length)].id;
  }

  resolveVotes(humanVotes = new Map()) {
    const alive = this.alivePlayers();
    let wolfChoice = this.wolf.human ? humanVotes.get(this.wolf.id) : this.chooseWolfVote();
    if (!wolfChoice || wolfChoice === this.wolf.id) wolfChoice = "none";
    const votes = [];
    for (const voter of alive) {
      let choice;
      if (voter.role === "wolf") choice = wolfChoice;
      else if (voter.human) choice = humanVotes.get(voter.id) ?? "none";
      else choice = this.chooseCpuVote(voter);
      if (voter.infected) choice = wolfChoice;
      if (choice === voter.id || (choice !== "none" && !alive.some((target) => target.id === choice))) choice = "none";
      votes.push({ voterId: voter.id, choice });
    }

    const tally = new Map([["none", 0]]);
    for (const vote of votes) tally.set(vote.choice, (tally.get(vote.choice) ?? 0) + 1);
    const options = [...tally.keys()];
    const winner = maxWithRandomTie(options, (choice) => tally.get(choice), this.rng);
    let exiled = null;
    if (winner !== "none") {
      exiled = this.players.find((player) => player.id === winner);
      exiled.alive = false;
    }
    this.lastVote = { votes, tally, exiled };
    this.checkOutcome(exiled);
    this.phase = this.outcome ? "ended" : "night";
    return this.lastVote;
  }

  resolveNight(targetId = null) {
    if (!this.wolf.alive) return null;
    const candidates = this.alivePlayers().filter((player) => player.role !== "wolf" && !player.infected);
    if (!candidates.length) {
      this.checkOutcome();
      return null;
    }
    let target = candidates.find((player) => player.id === targetId);
    if (!target) {
      target = weightedChoice(candidates, (candidate) => candidate.human ? 1.6 : 1, this.rng);
    }
    target.infected = true;
    this.attackHistory.push(target.id);
    this.lastAttack = { targetId: target.id, round: this.round };
    this.checkOutcome();
    this.phase = this.outcome ? "ended" : "night-result";
    return { attacked: true, outcome: this.outcome };
  }

  checkOutcome(exiled = null) {
    if (exiled?.role === "wolf" || !this.wolf.alive) {
      this.outcome = { winner: "citizen", reason: "元の人狼が追放された。" };
      return this.outcome;
    }
    const alive = this.alivePlayers();
    const wolfSide = alive.filter((player) => player.role === "wolf" || player.infected).length;
    if (wolfSide > alive.length / 2) {
      this.outcome = { winner: "wolf", reason: `人狼と襲撃済み市民が生存者の過半数を超えた（${wolfSide}/${alive.length}）。` };
      return this.outcome;
    }
    return null;
  }

  startNextRound() {
    this.round += 1;
    this.phase = "investigation";
    this.lastVote = null;
    this.lastAttack = null;
  }
}
