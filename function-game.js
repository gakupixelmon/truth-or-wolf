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

function functionSignature(fn) {
  return Array.from({ length: MODULUS }, (_, input) => fn.evaluate(input)).join(",");
}

function makeFunctionLibrary() {
  const functions = [];
  for (const [a, b] of [[1, 1], [1, 3], [2, 1], [2, 3], [3, 2], [4, 1], [5, 4], [6, 2]]) {
    functions.push(makeFunction(`linear-${a}-${b}`, `f(x) = ${a === 1 ? "" : `${a}`}x + ${b}`, "一次関数", (x) => a * x + b));
  }
  for (const [a, b, c] of [[1, 0, 1], [1, 1, 2], [2, 0, 3], [2, 1, 0], [3, 2, 1], [4, 1, 2]]) {
    functions.push(makeFunction(`quadratic-${a}-${b}-${c}`, `f(x) = ${a}x² + ${b}x + ${c}`, "二次関数", (x) => a * x * x + b * x + c));
  }
  for (const [a, b] of [[1, 1], [2, 3], [3, 2], [5, 1]]) {
    functions.push(makeFunction(`cubic-${a}-${b}`, `f(x) = ${a}x³ + ${b}x`, "三次関数", (x) => a * x * x * x + b * x));
  }
  const tables = [
    [0, 2, 5, 1, 6, 3, 4],
    [3, 0, 4, 6, 1, 5, 2],
    [1, 4, 0, 5, 2, 6, 3],
    [6, 2, 0, 4, 1, 3, 5],
  ];
  tables.forEach((table, index) => functions.push(makeFunction(
    `table-${index}`,
    `f = [${table.join(", ")}]`,
    "表関数",
    (x) => table[x],
  )));
  return functions;
}

function signedValue(value) {
  const residue = mod(value);
  return residue <= 3 ? residue : residue - MODULUS;
}

function makeCondition(_index, rng) {
  const input = Math.floor(rng() * MODULUS);
  return {
    input,
    label: `x = ${input} で合成値の符号を見る`,
    observe: (value) => {
      const signed = signedValue(value);
      const key = signed > 0 ? "positive" : signed < 0 ? "negative" : "zero";
      const symbol = signed > 0 ? "+" : signed < 0 ? "−" : "0";
      return { key, symbol, display: `sgn = ${symbol}` };
    },
  };
}

function buildBalancedFunctions(wolfIndex, rng) {
  const library = makeFunctionLibrary();
  let fallback = null;
  for (let attempt = 0; attempt < 6000; attempt += 1) {
    const wolfFunction = library[Math.floor(rng() * library.length)];
    const wolfSignature = functionSignature(wolfFunction);
    const uniqueCitizens = [];
    const seen = new Set([wolfSignature]);
    for (const candidate of shuffle(library, rng)) {
      const signature = functionSignature(candidate);
      if (seen.has(signature)) continue;
      seen.add(signature);
      uniqueCitizens.push(candidate);
    }
    const citizens = uniqueCitizens.slice(0, 6);
    const functions = [];
    let citizenIndex = 0;
    for (let index = 0; index < 7; index += 1) {
      functions.push(index === wolfIndex ? wolfFunction : citizens[citizenIndex++]);
    }
    const conditions = Array.from({ length: 7 }, (_, index) => makeCondition(index, rng));
    const matchSets = [];
    let balanced = new Set(functions.map((_, index) => index));
    for (let observerIndex = 0; observerIndex < 7; observerIndex += 1) {
      if (observerIndex === wolfIndex) continue;
      const ownFunction = functions[observerIndex];
      const condition = conditions[observerIndex];
      const wolfKey = condition.observe(ownFunction.evaluate(wolfFunction.evaluate(condition.input))).key;
      const matches = new Set();
      if (wolfKey === "zero") matches.clear(); // Avoid zero as target sign to ensure enough matches
      for (let targetIndex = 0; targetIndex < 7; targetIndex += 1) {
        if (targetIndex === observerIndex) continue;
        const result = ownFunction.evaluate(functions[targetIndex].evaluate(condition.input));
        if (condition.observe(result).key === wolfKey) matches.add(targetIndex);
      }
      matchSets.push(matches);
      balanced = new Set([...balanced].filter((candidate) => matches.has(candidate)));
    }
    const eachAmbiguous = matchSets.every((matches) => matches.has(wolfIndex) && matches.size >= 2 && matches.size <= 4);
    const familyCount = new Set(functions.map((fn) => fn.family)).size;
    if (eachAmbiguous && balanced.size === 1 && balanced.has(wolfIndex) && familyCount >= 3) {
      for (let observerIndex = 0; observerIndex < 7; observerIndex += 1) {
        const ownFunction = functions[observerIndex];
        const condition = conditions[observerIndex];
        condition.targetSign = condition.observe(ownFunction.evaluate(wolfFunction.evaluate(condition.input))).key;
      }
      fallback = { functions, conditions, wolfFunction };
      return fallback;
    }
  }
  return fallback;
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
    const wolfIndex = Math.floor(rng() * 7);
    const setup = buildBalancedFunctions(wolfIndex, rng);
    this.omega = setup.wolfFunction;
    this.players = FUNCTION_NAMES.map((defaultName, index) => ({
      id: `p${index}`,
      name: index < humanCount ? (humanCount === 1 ? "あなた" : `プレイヤー${index + 1}`) : defaultName,
      human: index < humanCount,
      role: index === wolfIndex ? "wolf" : "citizen",
      infected: false,
      alive: true,
      baseFunction: setup.functions[index],
      condition: setup.conditions[index],
    }));
    this.suspicions = new Map();
    this.reliability = new Map();
    this.publicReports = [];
    this.investigationHistory = new Map(this.players.map((player) => [player.id, []]));
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
    return player.infected;
  }

  currentValue(player, input) {
    const baseValue = player.baseFunction.evaluate(input);
    return player.infected ? this.omega.evaluate(baseValue) : baseValue;
  }

  privateFunctionTable(player) {
    return Array.from({ length: MODULUS }, (_, input) => player.baseFunction.evaluate(input));
  }

  wolfCandidateSet(observerId) {
    const observer = this.players.find((player) => player.id === observerId);
    const condition = observer.condition;
    return this.players
      .filter((target) => target.id !== observer.id)
      .filter((target) => {
        const result = observer.baseFunction.evaluate(target.baseFunction.evaluate(condition.input));
        return condition.observe(result).key === condition.targetSign;
      })
      .map((target) => target.id);
  }

  investigate(observerId, targetId) {
    const observer = this.players.find((player) => player.id === observerId && player.alive);
    const target = this.players.find((player) => player.id === targetId && player.alive);
    if (!observer || !target || observer.id === target.id) throw new Error("Invalid investigation target");
    const innerValue = this.currentValue(target, observer.condition.input);
    const value = this.currentValue(observer, innerValue);
    const observed = observer.condition.observe(value);
    const isMatch = observed.key === observer.condition.targetSign;
    const report = {
      observer,
      target,
      condition: observer.condition,
      observed,
      isMatch,
      reportedSign: observed.symbol,
      truthful: true,
    };
    this.investigationHistory.get(observer.id).push(report);
    if (!observer.human && observer.role !== "wolf") {
      this.updateSuspicion(observer.id, target.id, isMatch, 1);
    }
    return report;
  }

  updateSuspicion(observerId, targetId, positive, trust = 1) {
    const map = this.suspicions.get(observerId);
    if (!map || targetId === observerId) return;
    const prior = map.get(targetId);
    const reliability = 0.5 + 0.38 * trust;
    const falsePositiveRate = 0.31;
    const likelihoodWolf = positive ? reliability : 1 - reliability;
    const likelihoodCitizen = positive ? falsePositiveRate : 1 - falsePositiveRate;
    const posterior = (prior * likelihoodWolf) /
      (prior * likelihoodWolf + (1 - prior) * likelihoodCitizen);
    map.set(targetId, Math.min(0.995, Math.max(0.005, posterior)));
  }

  publishReport(report, published = true) {
    if (!published) return null;
    const publicReport = { ...report, round: this.round };
    this.publicReports.push(publicReport);
    for (const listener of this.players.filter((player) => !player.human && player.alive && player.id !== report.observer.id)) {
      if (listener.role === "wolf") continue;
      const trust = this.reliability.get(listener.id).get(report.observer.id);
      this.updateSuspicion(listener.id, report.target.id, report.isMatch, trust);
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
        report.isMatch = !report.isMatch;
        const expectedSymbol = observer.condition.targetSign === "positive" ? "+" : "−";
        const unexpectedSymbol = observer.condition.targetSign === "positive" ? "−" : "+";
        report.reportedSign = report.isMatch ? expectedSymbol : unexpectedSymbol;
        report.truthful = false;
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