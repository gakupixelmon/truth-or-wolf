import { maxWithRandomTie } from "./probability.js";

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
  const innerValue = game.currentValue(target, observer.condition.input);
  const value = game.currentValue(observer, innerValue);
  const observed = observer.condition.observe(value);
  const isMatch = observed.key === observer.condition.targetSign;
  const report = { observer, target, condition: observer.condition, observed, isMatch, reportedSign: observed.symbol, truthful: true };
  game.investigationHistory.get(observer.id).push(report);
  if (!observer.human && observer.role !== "wolf") updateSuspicion(game, observer.id, target.id, isMatch, 1);
  return report;
}

export function publishReport(game, report, published = true) {
  if (!published) return null;
  const publicReport = { ...report, round: game.round };
  game.publicReports.push(publicReport);
  for (const listener of game.players.filter((player) => !player.human && player.alive && player.id !== report.observer.id)) {
    if (listener.role === "wolf") continue;
    const trust = game.reliability.get(listener.id).get(report.observer.id);
    updateSuspicion(game, listener.id, report.target.id, report.isMatch, trust);
  }
  return publicReport;
}

export function runCpuInvestigations(game) {
  const reports = [];
  for (const observer of game.players.filter((player) => !player.human && player.alive)) {
    const targets = game.alivePlayers().filter((target) => target.id !== observer.id);
    const target = observer.role === "wolf"
      ? targets[Math.floor(game.rng() * targets.length)]
      : maxWithRandomTie(targets, (candidate) => {
        const probability = game.suspicions.get(observer.id).get(candidate.id);
        return 1 - Math.abs(0.5 - probability) + game.rng() * 0.08;
      }, game.rng);
    const report = investigate(game, observer.id, target.id);
    if (observer.role === "wolf" && game.rng() < 0.72) {
      report.isMatch = !report.isMatch;
      const expectedSymbol = observer.condition.targetSign === "positive" ? "+" : "−";
      const unexpectedSymbol = observer.condition.targetSign === "positive" ? "−" : "+";
      report.reportedSign = report.isMatch ? expectedSymbol : unexpectedSymbol;
      report.truthful = false;
    }
    if (game.rng() < 0.82) {
      publishReport(game, report, true);
      reports.push(report);
    }
  }
  return reports;
}

