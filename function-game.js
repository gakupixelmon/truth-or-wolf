import { INPUT_COUNT, FUNCTION_NAMES, PLAYER_COUNT, PHASES } from "./rules/constants.js";
import { buildBalancedFunctions } from "./rules/functions.js";
import { investigate, publishReport, runCpuInvestigations, updateSuspicion } from "./rules/investigation.js";
import { resolveVotes } from "./rules/voting.js";
import { knownFunctionOptions, resolveNight } from "./rules/infection.js";
import { checkOutcome } from "./rules/victory.js";

export { INPUT_COUNT, FUNCTION_NAMES } from "./rules/constants.js";

/** ゲーム状態の保持を担当するファサード。ルール本体は rules/ 以下に分離。 */
export class FunctionWolfGame {
  constructor({ humanCount = 1, rng = Math.random } = {}) {
    this.rng = rng;
    this.round = 1;
    this.phase = PHASES.INVESTIGATION;
    const wolfIndex = Math.floor(rng() * PLAYER_COUNT);
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

  get wolf() { return this.players.find((player) => player.role === "wolf"); }
  alivePlayers() { return this.players.filter((player) => player.alive); }
  isComposed(player) { return player.infected; }

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

  currentValue(player, input) {
    const baseValue = player.baseFunction.evaluate(input);
    return player.infected ? this.omega.evaluate(baseValue) : baseValue;
  }

  privateFunctionTable(player) {
    return Array.from({ length: INPUT_COUNT }, (_, input) => player.baseFunction.evaluate(input));
  }

  wolfCandidateSet(observerId) {
    const observer = this.players.find((player) => player.id === observerId);
    const condition = observer.condition;
    return this.players
      .filter((target) => target.id !== observer.id)
      .filter((target) => condition.observe(observer.baseFunction.evaluate(target.baseFunction.evaluate(condition.input))).key === condition.targetSign)
      .map((target) => target.id);
  }

  investigate(observerId, targetId) { return investigate(this, observerId, targetId); }
  updateSuspicion(observerId, targetId, positive, trust = 1) { return updateSuspicion(this, observerId, targetId, positive, trust); }
  publishReport(report, published = true) { return publishReport(this, report, published); }
  runCpuInvestigations() { return runCpuInvestigations(this); }
  getHumanActors() { return this.players.filter((player) => player.human && player.alive); }

  getAverageSuspicion(targetId) {
    const observers = this.players.filter((player) => !player.human && player.alive && player.role !== "wolf" && player.id !== targetId);
    if (!observers.length) return 1 / Math.max(1, this.alivePlayers().length - 1);
    return observers.reduce((sum, observer) => sum + this.suspicions.get(observer.id).get(targetId), 0) / observers.length;
  }

  resolveVotes(humanVotes = new Map()) { return resolveVotes(this, humanVotes); }
  resolveNight(targetId = null, functionId = undefined) { return resolveNight(this, targetId, functionId); }
  knownFunctionOptions() { return knownFunctionOptions(this); }
  checkOutcome(exiled = null) { return checkOutcome(this, exiled); }

  startNextRound() {
    this.round += 1;
    this.phase = PHASES.INVESTIGATION;
    this.lastVote = null;
    this.lastAttack = null;
  }
}
