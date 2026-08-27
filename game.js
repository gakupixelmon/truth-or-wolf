import { atom, binary, checkNewStatement, isConsistent, not, ROLES } from "./logic.js";

export const PLAYER_NAMES = ["あなた", "アオイ", "レン", "ミナト", "ユイ", "カイ", "スズ"];
export const ROLE_SET = ["wolf", "seer", "guardian", "citizen", "citizen", "citizen", "citizen"];
export const AI_RULES = {
  truthThreshold: 0.62,
  groundedThreshold: 0.82,
  speculationChance: 0.28,
  speculationMin: 0.12,
  speculationMax: 0.78,
  seerRevealChance: 0.68,
};

function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function clamp(value, min = 0.01, max = 0.99) {
  return Math.min(max, Math.max(min, value));
}

function normalize(distribution) {
  const total = ROLES.reduce((sum, role) => sum + Math.max(0, distribution[role] ?? 0), 0);
  if (total <= 0) {
    for (const role of ROLES) distribution[role] = 1 / ROLES.length;
    return distribution;
  }
  for (const role of ROLES) distribution[role] = Math.max(0, distribution[role] ?? 0) / total;
  return distribution;
}

function certainDistribution(role) {
  return Object.fromEntries(ROLES.map((candidate) => [candidate, candidate === role ? 1 : 0]));
}

function weightedChoice(items, weight, rng) {
  const weights = items.map((item) => Math.max(0.0001, weight(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
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

export class TruthOrWolfGame {
  constructor(rng = Math.random) {
    this.rng = rng;
    const roles = shuffle(ROLE_SET, rng);
    this.players = PLAYER_NAMES.map((name, index) => ({
      id: `p${index}`,
      name,
      role: roles[index],
      alive: true,
      revealed: index === 0,
    }));
    this.day = 1;
    this.phase = "discussion";
    this.statementsToday = 0;
    this.playerHistory = [];
    this.publicFacts = [];
    this.cpuHistories = new Map();
    this.seerResults = new Map();
    this.lastNight = null;
    this.beliefs = new Map();
    this.reliability = new Map();
    this.threat = new Map();
    this.initializeBeliefs();
    this.createInitialDivination();
  }

  get human() {
    return this.players[0];
  }

  alivePlayers() {
    return this.players.filter((player) => player.alive);
  }

  initializeBeliefs() {
    const roleCounts = { wolf: 1, seer: 1, guardian: 1, citizen: 4 };
    for (const observer of this.players.slice(1)) {
      const map = new Map();
      for (const target of this.players) {
        if (target.id === observer.id) {
          map.set(target.id, certainDistribution(observer.role));
          continue;
        }
        const distribution = {};
        for (const role of ROLES) {
          const remaining = roleCounts[role] - (observer.role === role ? 1 : 0);
          const personalBias = 0.82 + this.rng() * 0.36;
          distribution[role] = Math.max(0, remaining) * personalBias;
        }
        map.set(target.id, normalize(distribution));
      }
      this.beliefs.set(observer.id, map);
      this.reliability.set(observer.id, new Map(this.players.map((speaker) => [
        speaker.id,
        speaker.id === observer.id ? 1 : 0.57 + this.rng() * 0.24,
      ])));
      this.threat.set(observer.id, new Map(this.players.map((target) => [target.id, 0.1])));
      this.cpuHistories.set(observer.id, []);
    }
  }

  createInitialDivination() {
    const seer = this.players.find((player) => player.role === "seer");
    const candidates = this.players.filter((player) => player.id !== seer.id && player.role !== "wolf");
    const target = candidates[Math.floor(this.rng() * candidates.length)];
    const result = { targetId: target.id, isWolf: false, announced: false, initial: true };
    this.seerResults.set(seer.id, result);
    this.applyDivinationKnowledge(seer, result);
  }

  getHumanInitialDivination() {
    if (this.human.role !== "seer") return null;
    return this.seerResults.get(this.human.id) ?? null;
  }

  getRoleBeliefs(observerId, targetId) {
    return { ...(this.beliefs.get(observerId)?.get(targetId) ?? {}) };
  }

  getBelief(observerId, targetId, role) {
    return this.beliefs.get(observerId)?.get(targetId)?.[role] ?? 0;
  }

  getAverageSuspicion(targetId) {
    const observers = this.players.slice(1).filter((player) => player.alive && player.id !== targetId);
    if (!observers.length) return 0;
    return observers.reduce((sum, observer) => sum + this.getBelief(observer.id, targetId, "wolf"), 0) / observers.length;
  }

  makePlayerStatement(formula) {
    const verdict = checkNewStatement(this.players, this.playerHistory, formula, this.publicFacts);
    if (!verdict.consistent) {
      this.phase = "logic-exile";
      this.human.alive = false;
      return verdict;
    }
    this.playerHistory.push(formula);
    this.statementsToday += 1;
    this.applyStatementToBeliefs(this.human, formula);
    return verdict;
  }

  updateDistributionFromClaim(observerId, targetId, role, positive, strength, sourceId) {
    if (observerId === targetId) return;
    const distribution = this.beliefs.get(observerId).get(targetId);
    const credibility = this.reliability.get(observerId).get(sourceId) ?? 0.65;
    const effective = 0.5 + (credibility - 0.5) * strength;
    const evaluatedRole = role === "citizen" ? "wolf" : role;
    const evaluatedPositive = role === "citizen" ? !positive : positive;
    for (const candidateRole of ROLES) {
      const matches = candidateRole === evaluatedRole;
      const supportsClaim = evaluatedPositive ? matches : !matches;
      distribution[candidateRole] *= supportsClaim ? effective : 1 - effective;
    }
    normalize(distribution);
  }

  extractClaimEvidence(formula, polarity = true, strength = 1) {
    if (formula.type === "atom") {
      return [{ targetId: formula.playerId, role: formula.role, positive: polarity, strength }];
    }
    if (formula.type === "not") return this.extractClaimEvidence(formula.value, !polarity, strength);
    if (formula.type === "and") {
      return [
        ...this.extractClaimEvidence(formula.left, polarity, strength),
        ...this.extractClaimEvidence(formula.right, polarity, strength),
      ];
    }
    if (formula.type === "or") {
      return [
        ...this.extractClaimEvidence(formula.left, polarity, strength * 0.48),
        ...this.extractClaimEvidence(formula.right, polarity, strength * 0.48),
      ];
    }
    if (formula.type === "implies") {
      return [
        ...this.extractClaimEvidence(formula.left, !polarity, strength * 0.22),
        ...this.extractClaimEvidence(formula.right, polarity, strength * 0.34),
      ];
    }
    // An equivalence alone does not say which side is true.
    return [];
  }

  updateReliabilityFromKnownFact(observer, speaker, formula) {
    let claim = null;
    if (formula.type === "atom" && formula.playerId === observer.id) {
      claim = { role: formula.role, positive: true };
    } else if (formula.type === "not" && formula.value.type === "atom" && formula.value.playerId === observer.id) {
      claim = { role: formula.value.role, positive: false };
    }
    if (!claim || speaker.id === observer.id) return;

    const predicateTruth = claim.role === "citizen"
      ? observer.role !== "wolf"
      : observer.role === claim.role;
    const correct = claim.positive === predicateTruth;
    const reliability = this.reliability.get(observer.id);
    const prior = reliability.get(speaker.id);
    reliability.set(speaker.id, correct ? prior + (1 - prior) * 0.09 : prior * 0.86);

    // Correct private-looking information is weak evidence that the speaker is
    // the seer. It is deliberately not certainty: anyone may have guessed.
    if (correct && (claim.role === "wolf" || claim.role === "citizen" || observer.role === claim.role)) {
      this.updateDistributionFromClaim(observer.id, speaker.id, "seer", true, 0.32, speaker.id);
    }
  }

  applyStatementToBeliefs(speaker, formula) {
    const evidence = this.extractClaimEvidence(formula);

    for (const observer of this.players.slice(1).filter((player) => player.alive)) {
      if (observer.id !== speaker.id) {
        for (const claim of evidence) {
          this.updateDistributionFromClaim(
            observer.id,
            claim.targetId,
            claim.role,
            claim.positive,
            claim.strength,
            speaker.id,
          );
        }
        this.updateReliabilityFromKnownFact(observer, speaker, formula);
      }
      if (observer.role === "wolf") {
        const threatMap = this.threat.get(observer.id);
        const danger = evidence.filter((claim) => claim.role === "wolf" || claim.role === "seer").length;
        threatMap.set(speaker.id, clamp(threatMap.get(speaker.id) + danger * 0.07));
      }
    }
  }

  estimateFormulaProbability(observerId, formula) {
    if (formula.type === "atom") {
      if (formula.role === "citizen") return 1 - this.getBelief(observerId, formula.playerId, "wolf");
      return this.getBelief(observerId, formula.playerId, formula.role);
    }
    if (formula.type === "not") return 1 - this.estimateFormulaProbability(observerId, formula.value);
    const left = this.estimateFormulaProbability(observerId, formula.left);
    const right = this.estimateFormulaProbability(observerId, formula.right);
    if (formula.type === "and") return left * right;
    if (formula.type === "or") return left + right - left * right;
    if (formula.type === "implies") return 1 - left + left * right;
    return left * right + (1 - left) * (1 - right);
  }

  createVillagerStatement(speaker) {
    const result = this.seerResults.get(speaker.id);
    if (speaker.role === "seer" && result && !result.announced && this.rng() < AI_RULES.seerRevealChance) {
      result.announced = true;
      return result.isWolf ? atom("wolf", result.targetId) : atom("citizen", result.targetId);
    }

    const targets = this.alivePlayers().filter((player) => player.id !== speaker.id);
    const direct = [];
    for (const target of targets) {
      for (const role of ROLES) {
        const probability = role === "citizen"
          ? 1 - this.getBelief(speaker.id, target.id, "wolf")
          : this.getBelief(speaker.id, target.id, role);
        if (probability >= AI_RULES.speculationMin) direct.push({ formula: atom(role, target.id), probability });
      }
      direct.push({
        formula: not(atom("wolf", target.id)),
        probability: 1 - this.getBelief(speaker.id, target.id, "wolf"),
      });
    }

    const selfClaim = atom(speaker.role, speaker.id);
    if (!this.cpuHistories.get(speaker.id).some((formula) => JSON.stringify(formula) === JSON.stringify(selfClaim))) {
      direct.push({ formula: selfClaim, probability: 1 });
    }

    const highConfidence = direct.filter((item) => item.probability >= AI_RULES.truthThreshold);
    const best = Math.max(...direct.map((item) => item.probability));

    // Once grounded by a very reliable fact, villagers sometimes voice a less
    // certain abductive hypothesis, such as identifying a likely seer.
    if (best >= AI_RULES.groundedThreshold && this.rng() < AI_RULES.speculationChance) {
      const uncertain = direct.filter((item) =>
        item.formula.type === "atom"
        && item.probability >= AI_RULES.speculationMin
        && item.probability <= AI_RULES.speculationMax
        && item.formula.playerId !== speaker.id);
      if (uncertain.length) {
        const hypotheses = uncertain.sort((a, b) => {
          const aBonus = a.formula.role === "seer" ? 0.15 : 0;
          const bBonus = b.formula.role === "seer" ? 0.15 : 0;
          return (b.probability + bBonus) - (a.probability + aBonus);
        }).slice(0, 5);
        return weightedChoice(hypotheses, (item) => item.probability, this.rng).formula;
      }
    }

    const pool = (highConfidence.length ? highConfidence : direct)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 8);
    const chosen = weightedChoice(pool, (item) => Math.exp(item.probability * 5), this.rng);
    const second = pool.find((item) => JSON.stringify(item.formula) !== JSON.stringify(chosen.formula));
    if (second && this.rng() < 0.22) {
      const conjunction = binary("and", chosen.formula, second.formula);
      if (this.estimateFormulaProbability(speaker.id, conjunction) >= AI_RULES.truthThreshold) return conjunction;
    }
    if (second && this.rng() < 0.18) {
      const implication = binary("implies", second.formula, chosen.formula);
      if (this.estimateFormulaProbability(speaker.id, implication) >= 0.68) return implication;
    }
    return chosen.formula;
  }

  createWolfStatement(speaker) {
    const targets = this.alivePlayers().filter((player) => player.id !== speaker.id);
    const threat = this.threat.get(speaker.id);
    const target = maxWithRandomTie(targets, (candidate) => threat.get(candidate.id), this.rng);
    const alternate = targets.find((candidate) => candidate.id !== target.id) ?? target;
    const roll = this.rng();
    if (roll < 0.28) return not(atom("wolf", speaker.id));
    if (roll < 0.58) return atom("wolf", target.id);
    if (roll < 0.78) return binary("or", atom("wolf", target.id), atom("wolf", alternate.id));
    if (roll < 0.9) return atom("citizen", speaker.id);
    return binary("implies", atom("seer", target.id), not(atom("wolf", target.id)));
  }

  createCpuStatement(speaker) {
    return speaker.role === "wolf" ? this.createWolfStatement(speaker) : this.createVillagerStatement(speaker);
  }

  runCpuDiscussion() {
    const messages = [];
    const speakers = shuffle(this.players.slice(1).filter((player) => player.alive), this.rng);
    for (const speaker of speakers) {
      if (this.rng() < 0.18) continue;
      let formula = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = this.createCpuStatement(speaker);
        const history = this.cpuHistories.get(speaker.id);
        if (isConsistent(this.players, [...history, candidate], this.publicFacts)) {
          formula = candidate;
          history.push(candidate);
          break;
        }
      }
      if (!formula) continue;
      this.applyStatementToBeliefs(speaker, formula);
      messages.push({ speaker, formula });
    }
    return messages;
  }

  vote(humanTargetId) {
    this.phase = "vote-result";
    const votes = [];
    const alive = this.alivePlayers();
    for (const voter of alive) {
      let target;
      if (voter.id === this.human.id) {
        target = alive.find((player) => player.id === humanTargetId && player.id !== voter.id);
      } else if (voter.role === "wolf") {
        const candidates = alive.filter((player) => player.id !== voter.id);
        const threat = this.threat.get(voter.id);
        target = maxWithRandomTie(candidates, (candidate) => threat.get(candidate.id), this.rng);
      } else {
        const candidates = alive.filter((player) => player.id !== voter.id);
        target = maxWithRandomTie(candidates, (candidate) => this.getBelief(voter.id, candidate.id, "wolf"), this.rng);
      }
      if (target) votes.push({ voter, target });
    }

    const counts = new Map();
    for (const vote of votes) counts.set(vote.target.id, (counts.get(vote.target.id) ?? 0) + 1);
    const exile = maxWithRandomTie(
      [...counts.keys()].map((id) => this.players.find((player) => player.id === id)),
      (player) => counts.get(player.id),
      this.rng,
    );
    exile.alive = false;
    exile.revealed = true;
    // Reveals are evidence for the probability model, not part of a speaker's
    // formal commitment. A statement may be a lie without being a contradiction.
    this.applyRevealedRole(exile);
    return { votes, counts, exile, outcome: this.checkOutcome() };
  }

  applyRevealedRole(player) {
    for (const observer of this.players.slice(1)) {
      const map = this.beliefs.get(observer.id);
      map.set(player.id, certainDistribution(player.role));
      if (["wolf", "seer", "guardian"].includes(player.role)) {
        for (const other of this.players) {
          if (other.id === player.id || other.id === observer.id) continue;
          const distribution = map.get(other.id);
          distribution[player.role] = 0;
          normalize(distribution);
        }
      }
    }
  }

  applyDivinationKnowledge(seer, result) {
    if (seer.id === this.human.id) return;
    const distribution = this.beliefs.get(seer.id).get(result.targetId);
    if (result.isWolf) {
      this.beliefs.get(seer.id).set(result.targetId, certainDistribution("wolf"));
      for (const other of this.players) {
        if (other.id === result.targetId || other.id === seer.id) continue;
        const otherDistribution = this.beliefs.get(seer.id).get(other.id);
        otherDistribution.wolf = 0;
        normalize(otherDistribution);
      }
    } else {
      distribution.wolf = 0;
      normalize(distribution);
    }
  }

  checkOutcome() {
    if (!this.human.alive) {
      return { over: true, won: false, reason: "あなたは村から姿を消した。" };
    }
    const alive = this.alivePlayers();
    const wolves = alive.filter((player) => player.role === "wolf").length;
    const villagers = alive.length - wolves;
    if (wolves === 0) {
      return { over: true, won: this.human.role !== "wolf", reason: "人狼はすべて追放された。" };
    }
    if (wolves >= villagers) {
      return { over: true, won: this.human.role === "wolf", reason: "人狼が村を支配した。" };
    }
    return { over: false };
  }

  getNightAction() {
    if (!this.human.alive) return null;
    if (this.human.role === "wolf") return { type: "attack", label: "襲撃する相手を選ぶ" };
    if (this.human.role === "seer") return { type: "divine", label: "占う相手を選ぶ" };
    if (this.human.role === "guardian") return { type: "protect", label: "護衛する相手を選ぶ" };
    return { type: "sleep", label: "夜を明かす" };
  }

  getNightCandidates(actionType) {
    const alive = this.alivePlayers();
    if (actionType === "protect") return alive;
    if (actionType === "divine") {
      const previous = this.seerResults.get(this.human.id)?.targetId;
      return alive.filter((player) => player.id !== this.human.id && player.id !== previous);
    }
    return alive.filter((player) => player.id !== this.human.id);
  }

  resolveNight(humanTargetId = null) {
    this.phase = "night-result";
    const alive = this.alivePlayers();
    const wolf = alive.find((player) => player.role === "wolf");
    const seer = alive.find((player) => player.role === "seer");
    const guardian = alive.find((player) => player.role === "guardian");
    let victim = null;
    let protectedPlayer = null;
    let divineResult = null;

    if (wolf) {
      if (wolf.id === this.human.id) victim = alive.find((player) => player.id === humanTargetId);
      else {
        const targets = alive.filter((player) => player.id !== wolf.id);
        const threat = this.threat.get(wolf.id);
        victim = maxWithRandomTie(targets, (target) => threat.get(target.id) + this.rng() * 0.06, this.rng);
      }
    }

    if (guardian) {
      if (guardian.id === this.human.id) protectedPlayer = alive.find((player) => player.id === humanTargetId);
      else {
        const candidates = alive.filter((player) => player.id !== guardian.id);
        protectedPlayer = maxWithRandomTie(
          candidates,
          (candidate) => this.getBelief(guardian.id, candidate.id, "seer")
            + (1 - this.getBelief(guardian.id, candidate.id, "wolf")) * 0.28
            + this.rng() * 0.08,
          this.rng,
        );
      }
    }

    if (seer) {
      let target;
      if (seer.id === this.human.id) target = alive.find((player) => player.id === humanTargetId);
      else {
        const previous = this.seerResults.get(seer.id)?.targetId;
        const candidates = alive.filter((player) => player.id !== seer.id && player.id !== previous);
        target = maxWithRandomTie(
          candidates,
          (candidate) => this.getBelief(seer.id, candidate.id, "wolf"),
          this.rng,
        );
      }
      if (target) {
        divineResult = { targetId: target.id, isWolf: target.role === "wolf", announced: false };
        this.seerResults.set(seer.id, divineResult);
        this.applyDivinationKnowledge(seer, divineResult);
      }
    }

    let killed = null;
    if (victim && victim.id !== protectedPlayer?.id) {
      victim.alive = false;
      killed = victim;
    }
    this.lastNight = { killed, protectedPlayer, divineResult: seer?.id === this.human.id ? divineResult : null };
    return { ...this.lastNight, outcome: this.checkOutcome() };
  }

  startNextDay() {
    this.day += 1;
    this.phase = "discussion";
    this.statementsToday = 0;
  }
}
