import { maxWithRandomTie } from "./probability.js";
import { shuffle } from "./functions.js";

export const TARGET_SIGN_KEYS = Object.freeze(["positive", "negative", "zero"]);

function signSymbol(key) {
  return key === "positive" ? "+" : key === "negative" ? "−" : "0";
}

function observedForKey(key) {
  const symbol = signSymbol(key);
  return { key, symbol, display: `符号は${symbol}です。` };
}

function oppositeSignKey(key) {
  return key === "positive" ? "negative" : key === "negative" ? "positive" : "zero";
}

function chooseNonMatchingSign(game, targetSign) {
  const choices = TARGET_SIGN_KEYS.filter((key) => key !== targetSign);
  return choices[Math.floor(game.rng() * choices.length)] ?? "negative";
}

function claimTarget(game, observer, target) {
  if (!game.rules.limitInvestigatorsPerTarget) return;
  if (!game.investigationClaims) game.investigationClaims = new Map();
  const claimants = game.investigationClaims.get(target.id) ?? [];
  if (claimants.includes(observer.id)) return;
  if (claimants.length >= game.rules.maxInvestigatorsPerTarget) {
    throw new Error("Investigation target is full");
  }
  claimants.push(observer.id);
  game.investigationClaims.set(target.id, claimants);
}

export function updateSuspicion(game, observerId, targetId, positive, trust = 1) {
  const map = game.suspicions.get(observerId);
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

export function investigate(game, observerId, targetId) {
  const observer = game.players.find((player) => player.id === observerId && player.alive);
  const target = game.players.find((player) => player.id === targetId && player.alive);
  if (!observer || !target || observer.id === target.id) throw new Error("Invalid investigation target");
  claimTarget(game, observer, target);
  const innerValue = game.currentValue(target, observer.condition.input);
  const value = game.currentValue(observer, innerValue);
  let observed = observer.condition.observe(value);
  if (game.rules.madmanRandomObservation && target.role === "madman") {
    observed = observedForKey(game.rng() < 0.5 ? "positive" : "negative");
  }
  if (game.rules.infectedWolfObservationAlwaysNonWolf && observer.infected && target.role === "wolf") {
    observed = observedForKey(chooseNonMatchingSign(game, observer.condition.targetSign));
  }
  const targetSign = observer.condition.targetSign;
  const isMatch = observed.key === targetSign;
  const report = { observer, target, condition: observer.condition, targetSign, observed, isMatch, reportedSign: observed.symbol, truthful: true };
  game.investigationHistory.get(observer.id).push(report);
  if (observer.role === "madman") {
    game.madmanTruthReports.push({
      round: game.round,
      observerId: observer.id,
      targetId: target.id,
      targetSign,
      observed: { ...observed },
      isMatch,
    });
  }
  if (!observer.human && observer.role !== "wolf" && observer.role !== "madman") updateSuspicion(game, observer.id, target.id, isMatch, 1);
  return report;
}

export function chooseReportTargetSign(report, targetSign) {
  if (report?.observer?.role !== "wolf" && report?.observer?.role !== "madman") throw new Error("Only wolf faction can choose a report target sign");
  if (!TARGET_SIGN_KEYS.includes(targetSign)) throw new Error("Invalid target sign");
  report.targetSign = targetSign;
  report.condition = targetSign === report.observer.condition.targetSign
    ? report.observer.condition
    : { ...report.observer.condition, targetSign };
  report.isMatch = report.observed.key === targetSign;
  return report;
}

/** 人狼陣営が実際の観測対象とは別の対象を公表先に選ぶ。 */
export function chooseReportPublicationTarget(report, target) {
  if (report?.observer?.role !== "wolf" && report?.observer?.role !== "madman") {
    throw new Error("Only wolf faction can choose a publication target");
  }
  if (!target || target.alive === false || target.id === report.observer.id) throw new Error("Invalid publication target");
  report.publicTarget = target;
  return report;
}

/** 市民が感染を疑ったときに、観測した符号の正負を反転して公表する。 */
export function reverseReport(report) {
  if (report?.observer?.role !== "citizen") throw new Error("Only citizens can reverse a report");
  const key = oppositeSignKey(report.observed.key);
  const observed = observedForKey(key);
  report.reportedSign = observed.symbol;
  report.isMatch = key === report.condition.targetSign;
  report.truthful = false;
  return report;
}

export function publishReport(game, report, published = true) {
  if (!published) return null;
  const publicTarget = report.publicTarget ?? report.target;
  const { publicTarget: _privatePublicationTarget, ...reportData } = report;
  const publicReport = { ...reportData, target: publicTarget, round: game.round };
  game.publicReports.push(publicReport);
  for (const listener of game.players.filter((player) => !player.human && player.alive && player.id !== report.observer.id)) {
    if (listener.role === "wolf") continue;
    const trust = game.reliability.get(listener.id).get(report.observer.id);
    updateSuspicion(game, listener.id, publicTarget.id, report.isMatch, trust);
  }
  return publicReport;
}

function chooseCpuTarget(game, observer, targets) {
  return observer.role === "wolf" || observer.role === "madman"
    ? targets[Math.floor(game.rng() * targets.length)]
    : maxWithRandomTie(targets, (candidate) => {
      const probability = game.suspicions.get(observer.id).get(candidate.id);
      return 1 - Math.abs(0.5 - probability) + game.rng() * 0.08;
    }, game.rng);
}

function availableCpuTargets(game, observer) {
  return game.alivePlayers().filter((target) => {
    if (target.id === observer.id) return false;
    if (!game.rules.limitInvestigatorsPerTarget) return true;
    const claimants = game.investigationClaims?.get(target.id) ?? [];
    return claimants.length < game.rules.maxInvestigatorsPerTarget;
  });
}

function processCpuInvestigation(game, observer, target, reports) {
  let report;
  try {
    report = investigate(game, observer.id, target.id);
  } catch {
    // 人間の先着枠などで空き枠がなくなった場合は観測しない。
    return;
  }
  if (observer.role === "wolf" || observer.role === "madman") {
    chooseReportTargetSign(report, TARGET_SIGN_KEYS[Math.floor(game.rng() * TARGET_SIGN_KEYS.length)]);
  }
  if (observer.role === "madman") {
    const reportedKey = TARGET_SIGN_KEYS[Math.floor(game.rng() * TARGET_SIGN_KEYS.length)];
    report.reportedSign = reportedKey === "positive" ? "+" : reportedKey === "negative" ? "−" : "0";
    report.isMatch = reportedKey === report.condition.targetSign;
    report.truthful = report.reportedSign === report.observed.symbol;
  } else if (observer.role === "wolf" && game.rng() < 0.72) {
    report.isMatch = !report.isMatch;
    const expectedSymbol = report.condition.targetSign === "positive" ? "+" : report.condition.targetSign === "negative" ? "−" : "0";
    const unexpectedSymbol = report.condition.targetSign === "positive" ? "−" : "+";
    report.reportedSign = report.isMatch ? expectedSymbol : unexpectedSymbol;
    report.truthful = false;
  }
  if (observer.role === "wolf" || observer.role === "madman") {
    const publicTargets = game.alivePlayers().filter((candidate) => candidate.id !== observer.id);
    if (publicTargets.length && game.rng() < 0.35) {
      chooseReportPublicationTarget(report, publicTargets[Math.floor(game.rng() * publicTargets.length)]);
    }
  }
  // 狂人の真の観測は、市民への公開を選ばなかった場合でも人狼へ伝える。
  // 戻り値には公開・非公開を問わず CPU の観測を含め、サーバー側で
  // 狂人の真情報だけを人狼へ送れるようにする。
  reports.push(report);
  if (game.rng() < 0.82) publishReport(game, report, true);
}

export function runCpuInvestigations(game) {
  const reports = [];
  const limitEnabled = game.rules.limitInvestigatorsPerTarget;
  const cpuObservers = limitEnabled
    ? shuffle(game.players.filter((player) => !player.human && player.alive), game.rng)
    : game.players.filter((player) => !player.human && player.alive);

  if (!limitEnabled) {
    for (const observer of cpuObservers) {
      const targets = availableCpuTargets(game, observer);
      if (!targets.length) continue;
      processCpuInvestigation(game, observer, chooseCpuTarget(game, observer, targets), reports);
    }
  } else {
    // CPUは候補を一度に決めるが、衝突で落選したCPUは次の抽選へ回す。
    // 人間の主張は investigationClaims にすでに入っているため、常に先に枠を確保する。
    let pendingObservers = [...cpuObservers];
    const observerOrder = new Map(cpuObservers.map((observer, index) => [observer.id, index]));
    while (pendingObservers.length) {
      const plans = [];
      const plansByTarget = new Map();
      for (const observer of pendingObservers) {
        const targets = availableCpuTargets(game, observer);
        if (!targets.length) continue;
        const target = chooseCpuTarget(game, observer, targets);
        const plan = { observer, target };
        plans.push(plan);
        const contenders = plansByTarget.get(target.id) ?? [];
        contenders.push(plan);
        plansByTarget.set(target.id, contenders);
      }
      if (!plans.length) break;

      const accepted = [];
      const acceptedObserverIds = new Set();
      for (const [targetId, contenders] of plansByTarget) {
        const occupied = game.investigationClaims?.get(targetId)?.length ?? 0;
        const slots = Math.max(0, game.rules.maxInvestigatorsPerTarget - occupied);
        for (const winner of shuffle(contenders, game.rng).slice(0, slots)) {
          accepted.push(winner);
          acceptedObserverIds.add(winner.observer.id);
        }
      }
      if (!accepted.length) break;
      accepted.sort((left, right) => observerOrder.get(left.observer.id) - observerOrder.get(right.observer.id));
      for (const { observer, target } of accepted) processCpuInvestigation(game, observer, target, reports);
      // 抽選に負けたCPUだけが、満員対象を候補から外して再選択する。
      pendingObservers = plans
        .filter(({ observer }) => !acceptedObserverIds.has(observer.id))
        .map(({ observer }) => observer);
    }
  }
  game.recordPosteriorSnapshot?.(`round-${game.round}-investigation`);
  return reports;
}
