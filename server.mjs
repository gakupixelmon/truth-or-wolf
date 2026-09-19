import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { Server } from "socket.io";
import { FunctionWolfGame } from "./function-game.js";
import { DEFAULT_PLAYER_COUNT, DEFAULT_RULES, MAX_MADMAN_COUNT, MAX_PLAYER_COUNT, MAX_WOLF_COUNT, MIN_PLAYER_COUNT } from "./rules/constants.js";
import { TARGET_SIGN_KEYS, chooseReportPublicationTarget, chooseReportTargetSign, reverseReport } from "./rules/investigation.js";

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional; deployment environments can provide variables directly.
}

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const adminEntryKey = String(process.env.TRUTH_OR_WOLF_ADMIN_KEY || "").trim();
const DISCONNECT_GRACE_MS = 30_000;
const DEFAULT_ADMIN_CONFIG = Object.freeze({ forceHumanRole: "random", trackPosterior: false });
const SOLO_HUMAN_ROLES = ["random", "citizen", "wolf", "madman"];
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/classic.html", ["classic.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/function-style.css", ["function-style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/function-app.js", ["function-app.js", "text/javascript; charset=utf-8"]],
  ["/function-game.js", ["function-game.js", "text/javascript; charset=utf-8"]],
  ["/function-ui/format.js", ["function-ui/format.js", "text/javascript; charset=utf-8"]],
  ["/function-ui/views.js", ["function-ui/views.js", "text/javascript; charset=utf-8"]],
  ["/function-ui/tutorial.js", ["function-ui/tutorial.js", "text/javascript; charset=utf-8"]],
  ["/function-ui/events.js", ["function-ui/events.js", "text/javascript; charset=utf-8"]],
  ["/game.js", ["game.js", "text/javascript; charset=utf-8"]],
  ["/logic.js", ["logic.js", "text/javascript; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  const file = files.get(pathname);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const body = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to load application file");
  }
});

const io = new Server(server);
const rooms = new Map();

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 24);
}

function isAdminEntry(value) {
  if (!adminEntryKey || String(value ?? "").length < 32) return false;
  const candidate = Buffer.from(String(value));
  const secret = Buffer.from(adminEntryKey);
  return candidate.length === secret.length && timingSafeEqual(candidate, secret);
}

function parseAdminRole(value, fallback = DEFAULT_ADMIN_CONFIG.forceHumanRole) {
  return ["random", "wolf", "identity"].includes(value) ? value : fallback;
}

function parseSoloHumanRole(value, fallback = "random", madmanCount = 0) {
  const safeFallback = SOLO_HUMAN_ROLES.includes(fallback) ? fallback : "random";
  const role = SOLO_HUMAN_ROLES.includes(value) ? value : safeFallback;
  return role === "madman" && madmanCount < 1 ? "random" : role;
}

function adminConfigFromInput(input = {}, fallback = DEFAULT_ADMIN_CONFIG) {
  return {
    forceHumanRole: parseAdminRole(input.forceHumanRole, fallback.forceHumanRole),
    trackPosterior: parseRuleBoolean(input.trackPosterior, fallback.trackPosterior),
  };
}

function parsePlayerCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= MIN_PLAYER_COUNT && count <= MAX_PLAYER_COUNT ? count : null;
}

function maxWolvesForPlayerCount(playerCount) {
  return Math.min(MAX_WOLF_COUNT, Math.floor((playerCount - 1) / 3));
}

function parseWolfCount(value, playerCount) {
  const count = Number(value);
  const maxWolves = maxWolvesForPlayerCount(playerCount);
  return Number.isInteger(count) && count >= 1 && count <= maxWolves ? count : null;
}

function maxMadmenForPlayerCount(playerCount, wolfCount) {
  return Math.min(MAX_MADMAN_COUNT, Math.max(0, playerCount - wolfCount - 1));
}

function parseMadmanCount(value, playerCount, wolfCount) {
  const count = Number(value);
  const maxMadmen = maxMadmenForPlayerCount(playerCount, wolfCount);
  return Number.isInteger(count) && count >= 0 && count <= maxMadmen ? count : null;
}

function parseMaxInvestigatorsPerTarget(value, playerCount, fallback = playerCount) {
  const count = value === undefined || value === null || value === "" ? fallback : Number(value);
  return Number.isInteger(count) && count >= 1 && count <= playerCount ? count : null;
}

function parseRuleBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === false) return value;
  return value === "true" || value === "1" || value === "on";
}

function roomRules(room) {
  return {
    includeIdentityFunction: room.includeIdentityFunction,
    requireAttackFunctionGuess: room.requireAttackFunctionGuess,
    anonymousVoting: room.anonymousVoting,
    revealConditionOnAttackFailure: room.revealConditionOnAttackFailure,
    infectedWolfObservationAlwaysNonWolf: room.infectedWolfObservationAlwaysNonWolf,
    limitInvestigatorsPerTarget: room.limitInvestigatorsPerTarget,
    maxInvestigatorsPerTarget: room.maxInvestigatorsPerTarget,
    soloHumanRole: room.soloHumanRole,
  };
}

function makeRoomCode() {
  let code;
  do {
    code = String(randomInt(0, 1000000)).padStart(6, "0");
  } while (rooms.has(code));
  return code;
}

function getRoom(socket) {
  return socket.data.roomCode ? rooms.get(socket.data.roomCode) : null;
}

function getMember(room, socketId) {
  return room?.members.find((member) => member.socketId === socketId) ?? null;
}

function getPlayer(room, playerId) {
  return room?.game?.players.find((player) => player.id === playerId) ?? null;
}

function publicPlayers(room) {
  return room.game.players.map((player) => ({
    id: player.id,
    name: player.name,
    alive: player.alive,
    human: player.human,
  }));
}

function publicReports(room) {
  return room.game.publicReports.map((report) => ({
    round: report.round,
    observerId: report.observer.id,
    observerName: report.observer.name,
    targetId: report.target.id,
    targetName: report.target.name,
    targetSign: report.targetSign ?? report.condition.targetSign,
    reportedSign: report.reportedSign,
  }));
}

function publicVoteResult(room) {
  const result = room.game.lastVote;
  if (!result) return null;
  // 1ゲーム中の公開範囲は、終了後に次回設定を変更しても変わらない。
  const anonymous = room.gameAnonymousVoting ?? room.anonymousVoting;
  return {
    // 個別の投票先は、匿名ルールではサーバーからクライアントへ送らない。
    votes: anonymous ? null : result.votes,
    anonymous,
    tally: Object.fromEntries(result.tally),
    exiled: result.exiled ? {
      id: result.exiled.id,
      name: result.exiled.name,
      role: result.exiled.role,
    } : null,
  };
}

function gameState(room, socketId) {
  const game = room.game;
  const member = getMember(room, socketId);
  const pendingCount = room.phase === "investigation"
    ? room.investigationPending?.size ?? 0
    : room.phase === "vote"
      ? room.votePending?.size ?? 0
      : 0;
  const submitted = room.phase === "investigation"
    ? room.investigationSubmitted?.has(member?.playerId) ?? false
    : room.phase === "vote"
      ? room.voteSubmitted?.has(member?.playerId) ?? false
      : false;
  const activePlayer = game && room.activePlayerId ? getPlayer(room, room.activePlayerId) : null;
  return {
    revision: room.gameStateRevision ?? 0,
    roomCode: room.code,
    phase: room.phase,
    round: game.round,
    omegaLabel: game.omega.label,
    players: publicPlayers(room),
    reports: publicReports(room),
    outcome: game.outcome,
    reveal: game.outcome ? game.players.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      infected: player.infected,
      functionLabel: player.baseFunction.label,
    })) : null,
    voteResult: room.phase === "vote-result" || room.phase === "ended" ? publicVoteResult(room) : null,
    activePlayerId: room.activePlayerId,
    activePlayerName: activePlayer?.name ?? null,
    pendingCount,
    submitted,
    voteRound: room.voteRound ?? 1,
    myPlayerId: member?.playerId ?? null,
    isHost: member?.socketId === room.hostSocketId,
    admin: member?.admin === true,
    playerCount: game.players.length,
    wolfCount: game.wolfCount,
    madmanCount: game.madmanCount,
    rules: { ...game.rules, anonymousVoting: room.gameAnonymousVoting ?? room.anonymousVoting },
    posteriorHistory: member?.admin === true && game.trackPosterior ? game.posteriorHistory : null,
  };
}

function roomState(room, socketId) {
  const member = getMember(room, socketId);
  return {
    revision: room.stateRevision ?? 0,
    code: room.code,
    // パスワードは部屋作成者本人にだけ返す。
    password: member?.socketId === room.hostSocketId ? room.password : null,
    playerCount: room.playerCount,
    wolfCount: room.wolfCount,
    madmanCount: room.madmanCount,
    maxInvestigatorsPerTarget: room.maxInvestigatorsPerTarget,
    ...roomRules(room),
    status: room.game ? "playing" : "lobby",
    isHost: member?.socketId === room.hostSocketId,
    isAdmin: member?.admin === true,
    adminConfig: member?.admin === true ? room.adminConfig : null,
    players: room.members.map((entry) => ({
      name: entry.name,
      connected: Boolean(io.sockets.sockets.get(entry.socketId)),
      isHost: entry.socketId === room.hostSocketId,
    })),
  };
}

function sendRoomState(room) {
  room.stateRevision = (room.stateRevision ?? 0) + 1;
  for (const member of room.members) {
    io.to(member.socketId).emit("room:update", roomState(room, member.socketId));
  }
}

function sendRoomSession(socket, room, member) {
  socket.emit("room:session", { code: room.code, token: member.resumeToken });
}

function sendGameState(room) {
  if (!room.game) return;
  room.gameStateRevision = (room.gameStateRevision ?? 0) + 1;
  for (const member of room.members) {
    io.to(member.socketId).emit("game:state", gameState(room, member.socketId));
  }
}

function sendError(socket, message) {
  socket.emit("room:error", { message });
}

function sendCurrentRoomState(room) {
  // モバイルのバックグラウンド復帰・再接続時は、公開状態と本人だけの状態を同じ順序で再送する。
  sendRoomState(room);
  if (!room.game) return;
  sendGameState(room);
  sendHumanIdentities(room);
  if (room.phase === "investigation") sendInvestigationTurns(room);
  if (room.phase === "vote") sendVoteTurns(room);
  if (room.phase === "night" && room.activePlayerId) sendNightTurn(room);
}

function privatePlayerData(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player) return null;
  const privateData = {
    playerId: player.id,
    name: player.name,
    role: player.role,
    function: {
      label: player.baseFunction.label,
      table: room.game.privateFunctionTable(player),
    },
    condition: {
      label: player.condition.label,
      input: player.condition.input,
      targetSign: player.condition.targetSign,
    },
    targetSignOptions: player.role === "wolf" || player.role === "madman" ? [...TARGET_SIGN_KEYS] : [],
  };
  // 人狼陣営にだけ、所有者を対応付けられない関数の種類一覧を渡す。
  // 狂人も人狼と同じ推測情報を持つが、襲撃操作は受け取らない。
  if (player.role === "wolf" || player.role === "madman") privateData.functionOptions = room.game.knownFunctionOptions();
  return privateData;
}

function sendHumanIdentities(room) {
  for (const player of room.game.players.filter((candidate) => candidate.human)) {
    const member = room.members.find((entry) => entry.playerId === player.id);
    if (!member) continue;
    io.to(member.socketId).emit("game:identity", {
      revision: room.gameStateRevision ?? 0,
      ...privatePlayerData(room, player.id),
    });
  }
}

function sendObservation(room, playerId) {
  const report = room.investigationReports.get(playerId);
  if (!report) return false;
  const member = room.members.find((entry) => entry.playerId === playerId);
  if (!member) return false;
  io.to(member.socketId).emit("game:observation", {
    revision: room.gameStateRevision ?? 0,
    target: { id: report.target.id, name: report.target.name },
    condition: { label: report.condition.label, targetSign: report.targetSign },
    observed: report.observed,
    targetSign: report.targetSign,
    isMatch: report.isMatch,
    reportedSign: report.reportedSign,
    truthful: true,
  });
  return true;
}

function sendInvestigationTurns(room) {
  for (const player of room.game.getHumanActors().filter((candidate) => candidate.alive)) {
    if (!room.investigationPending.has(player.id)) continue;
    const member = room.members.find((entry) => entry.playerId === player.id);
    if (!member) continue;
    if (sendObservation(room, player.id)) continue;
    io.to(member.socketId).emit("game:private", {
      revision: room.gameStateRevision ?? 0,
      kind: "investigation",
      ...privatePlayerData(room, player.id),
      targets: room.game.alivePlayers()
        .filter((target) => target.id !== player.id)
        .map((target) => ({ id: target.id, name: target.name })),
    });
  }
}

function sendVoteTurns(room) {
  const runoffCandidates = room.voteCandidates ? new Set(room.voteCandidates) : null;
  for (const player of room.game.getHumanActors().filter((candidate) => candidate.alive)) {
    if (!room.votePending.has(player.id)) continue;
    const member = room.members.find((entry) => entry.playerId === player.id);
    if (!member) continue;
    io.to(member.socketId).emit("game:private", {
      revision: room.gameStateRevision ?? 0,
      kind: "vote",
      ...privatePlayerData(room, player.id),
      voteRound: room.voteRound ?? 1,
      targets: room.game.alivePlayers()
        .filter((target) => target.id !== player.id && (!runoffCandidates || runoffCandidates.has(target.id)))
        .map((target) => ({ id: target.id, name: target.name })),
    });
  }
}

function sendExileReveal(room, exiled) {
  if (!exiled) return;
  const reveal = {
    playerId: exiled.id,
    playerName: exiled.name,
    function: {
      label: exiled.baseFunction.label,
      table: room.game.privateFunctionTable(exiled),
    },
    substitutionInput: exiled.condition.input,
    conditionLabel: exiled.condition.label,
    infected: exiled.infected,
  };
  for (const member of room.members) {
    const player = getPlayer(room, member.playerId);
    if (!player?.human || player.role !== "wolf" || !player.alive) continue;
    io.to(member.socketId).emit("game:exile-reveal", reveal);
  }
}

function sendMadmanTruth(room, report) {
  if (report.observer.role !== "madman") return;
  const truth = {
    round: room.game.round,
    observerName: report.observer.name,
    targetName: report.target.name,
    targetSign: report.observer.condition.targetSign,
    observed: report.observed,
    isMatch: report.observed.key === report.observer.condition.targetSign,
  };
  for (const member of room.members) {
    const player = getPlayer(room, member.playerId);
    if (player?.human && player.role === "wolf" && player.alive) {
      io.to(member.socketId).emit("game:madman-truth", truth);
    }
  }
}

function sendNightTurn(room) {
  const player = room.game.primaryWolf;
  const member = room.members.find((entry) => entry.playerId === player?.id);
  if (!player || !member) return;
  io.to(member.socketId).emit("game:private", {
    revision: room.gameStateRevision ?? 0,
    kind: "night",
    playerId: player.id,
    name: player.name,
    role: player.role,
    condition: {
      label: player.condition.label,
      input: player.condition.input,
      targetSign: player.condition.targetSign,
    },
    targets: room.game.alivePlayers()
      .filter((target) => target.role !== "wolf" && !target.infected)
      .map((target) => ({ id: target.id, name: target.name })),
    // 人狼には関数の種類だけを渡す。どのプレイヤーが持つかは渡さない。
    functionOptions: room.game.knownFunctionOptions(),
    requiresFunctionGuess: room.game.rules.requireAttackFunctionGuess,
  });
}

function beginInvestigation(room) {
  room.phase = "investigation";
  room.investigationPending = new Set(room.game.getHumanActors().filter((player) => player.alive).map((player) => player.id));
  room.investigationSubmitted = new Set();
  room.investigationReports = new Map();
  room.activePlayerId = null;
  if (room.investigationPending.size) {
    sendGameState(room);
    sendInvestigationTurns(room);
    return;
  }
  finishInvestigation(room);
}

function finishInvestigation(room) {
  const cpuReports = room.game.runCpuInvestigations();
  for (const report of cpuReports) sendMadmanTruth(room, report);
  room.phase = "discussion";
  room.activePlayerId = null;
  room.investigationPending = new Set();
  room.investigationReports = new Map();
  sendGameState(room);
}

function beginVote(room) {
  room.phase = "vote";
  room.voteRound = 1;
  room.voteCandidates = null;
  room.votePending = new Set(room.game.getHumanActors().filter((player) => player.alive).map((player) => player.id));
  room.voteSubmitted = new Set();
  room.humanVotes = new Map();
  room.activePlayerId = null;
  if (room.votePending.size) {
    sendGameState(room);
    sendVoteTurns(room);
    return;
  }
  finishVote(room);
}

function finishVote(room) {
  const result = room.game.resolveVotes(room.humanVotes, {
    candidateIds: room.voteCandidates,
    runoff: Boolean(room.voteCandidates),
  });
  if (result.needsRunoff) {
    room.phase = "vote";
    room.voteRound = (room.voteRound ?? 1) + 1;
    room.voteCandidates = new Set(result.runoffCandidates);
    room.votePending = new Set(room.game.getHumanActors().filter((player) => player.alive).map((player) => player.id));
    room.voteSubmitted = new Set();
    room.humanVotes = new Map();
    room.activePlayerId = null;
    sendGameState(room);
    sendVoteTurns(room);
    return;
  }
  room.voteCandidates = null;
  room.activePlayerId = null;
  room.phase = room.game.outcome ? "ended" : "vote-result";
  sendGameState(room);
  sendExileReveal(room, result.exiled);
}

function beginNight(room) {
  if (room.game.outcome) return;
  room.phase = "night";
  const wolf = room.game.primaryWolf;
  if (wolf.human && wolf.alive) {
    room.activePlayerId = wolf.id;
    sendGameState(room);
    sendNightTurn(room);
    return;
  }
  room.game.resolveNight();
  room.phase = room.game.outcome ? "ended" : "night-result";
  room.activePlayerId = null;
  sendGameState(room);
}

function finishNight(room, targetId, functionId) {
  const result = room.game.resolveNight(targetId, functionId);
  room.phase = room.game.outcome ? "ended" : "night-result";
  room.activePlayerId = null;
  sendGameState(room);
  if (result) {
    const target = result.targetId ? getPlayer(room, result.targetId) : null;
    const failureReveal = !result.success && room.revealConditionOnAttackFailure && target
      ? {
        targetName: target.name,
        conditionLabel: target.condition.label,
        substitutionInput: target.condition.input,
      }
      : null;
    // 人狼陣営の夜襲結果（失敗時の条件を含む）は、生存中の人狼全員に共有する。
    for (const member of room.members) {
      const player = getPlayer(room, member.playerId);
      if (player?.human && player.role === "wolf" && player.alive) {
        io.to(member.socketId).emit("game:attack-result", { success: result.success, failureReveal });
      }
    }
  }
}

function memberCanAct(room, socket, expectedPhase) {
  const member = getMember(room, socket.id);
  return Boolean(room?.game && room.phase === expectedPhase && member && member.playerId === room.activePlayerId);
}

function clearRoomIfEmpty(room) {
  if (room.members.length === 0) rooms.delete(room.code);
}

function scheduleMemberRemoval(room, socketId) {
  const member = getMember(room, socketId);
  if (!member) return;
  clearTimeout(member.disconnectTimer);
  member.disconnectTimer = setTimeout(() => {
    if (member.socketId === socketId && !io.sockets.sockets.get(socketId)) removeMember(room, socketId);
  }, DISCONNECT_GRACE_MS);
  sendRoomState(room);
}

function removeMember(room, socketId) {
  const removedMember = room.members.find((member) => member.socketId === socketId);
  clearTimeout(removedMember?.disconnectTimer);
  room.members = room.members.filter((member) => member.socketId !== socketId);
  if (room.hostSocketId === socketId) room.hostSocketId = room.members[0]?.socketId ?? null;
  if (room.game && room.members.length) {
    room.game.outcome = {
      winner: "citizen",
      reason: "プレイヤーが退出したため、このゲームは終了しました。",
    };
    room.phase = "ended";
    room.activePlayerId = null;
    sendGameState(room);
  }
  clearRoomIfEmpty(room);
  if (room.members.length) sendRoomState(room);
}

function startRoomGame(room) {
  room.gameAnonymousVoting = room.anonymousVoting;
  room.voteRound = 1;
  room.voteCandidates = null;
  const forceHumanRole = room.adminConfig.forceHumanRole !== "random"
    ? room.adminConfig.forceHumanRole
    : room.members.length === 1
      ? parseSoloHumanRole(room.soloHumanRole, "random", room.madmanCount)
      : "random";
  room.game = new FunctionWolfGame({
    humanCount: room.members.length,
    playerCount: room.playerCount,
    wolfCount: room.wolfCount,
    madmanCount: room.madmanCount,
    includeIdentityFunction: room.includeIdentityFunction,
    requireAttackFunctionGuess: room.requireAttackFunctionGuess,
    revealConditionOnAttackFailure: room.revealConditionOnAttackFailure,
    infectedWolfObservationAlwaysNonWolf: room.infectedWolfObservationAlwaysNonWolf,
    limitInvestigatorsPerTarget: room.limitInvestigatorsPerTarget,
    maxInvestigatorsPerTarget: room.maxInvestigatorsPerTarget,
    forceHumanRole,
    trackPosterior: room.adminConfig.trackPosterior,
  });
  room.members.forEach((member, index) => {
    const player = room.game.players[index];
    player.name = member.name;
    member.playerId = player.id;
  });
  beginInvestigation(room);
  sendRoomState(room);
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name, password, playerCount, wolfCount, madmanCount, includeIdentityFunction, requireAttackFunctionGuess, anonymousVoting, revealConditionOnAttackFailure, infectedWolfObservationAlwaysNonWolf, limitInvestigatorsPerTarget, maxInvestigatorsPerTarget } = {}) => {
    if (getRoom(socket)) return sendError(socket, "すでに部屋に参加しています。");
    const admin = isAdminEntry(name);
    const playerName = admin ? "管理者" : cleanText(name, "プレイヤー");
    const totalPlayerCount = parsePlayerCount(playerCount) ?? DEFAULT_PLAYER_COUNT;
    const totalWolfCount = parseWolfCount(wolfCount, totalPlayerCount) ?? 1;
    const totalMadmanCount = parseMadmanCount(madmanCount, totalPlayerCount, totalWolfCount) ?? 0;
    const totalMaxInvestigators = parseMaxInvestigatorsPerTarget(maxInvestigatorsPerTarget, totalPlayerCount) ?? totalPlayerCount;
    const room = {
      code: makeRoomCode(),
      password: String(password ?? "").slice(0, 64),
      playerCount: totalPlayerCount,
      wolfCount: totalWolfCount,
      madmanCount: totalMadmanCount,
      soloHumanRole: "random",
      maxInvestigatorsPerTarget: totalMaxInvestigators,
      includeIdentityFunction: parseRuleBoolean(includeIdentityFunction, DEFAULT_RULES.includeIdentityFunction),
      requireAttackFunctionGuess: parseRuleBoolean(requireAttackFunctionGuess, DEFAULT_RULES.requireAttackFunctionGuess),
      anonymousVoting: parseRuleBoolean(anonymousVoting, DEFAULT_RULES.anonymousVoting),
      revealConditionOnAttackFailure: parseRuleBoolean(revealConditionOnAttackFailure, DEFAULT_RULES.revealConditionOnAttackFailure),
      infectedWolfObservationAlwaysNonWolf: parseRuleBoolean(infectedWolfObservationAlwaysNonWolf, DEFAULT_RULES.infectedWolfObservationAlwaysNonWolf),
      limitInvestigatorsPerTarget: parseRuleBoolean(limitInvestigatorsPerTarget, DEFAULT_RULES.limitInvestigatorsPerTarget),
      adminConfig: { ...DEFAULT_ADMIN_CONFIG },
      hostSocketId: socket.id,
      members: [{ socketId: socket.id, playerId: null, name: playerName, admin, resumeToken: randomUUID(), disconnectTimer: null }],
      game: null,
      phase: "lobby",
      activePlayerId: null,
      investigationPending: new Set(),
      investigationSubmitted: new Set(),
      investigationReports: new Map(),
      votePending: new Set(),
      voteSubmitted: new Set(),
      voteRound: 1,
      voteCandidates: null,
      stateRevision: 0,
      gameStateRevision: 0,
    };
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    sendRoomSession(socket, room, room.members[0]);
    sendRoomState(room);
  });

  socket.on("room:resume", ({ code, token } = {}) => {
    if (getRoom(socket)) return;
    const room = rooms.get(String(code ?? "").trim());
    const member = room?.members.find((entry) => entry.resumeToken === String(token ?? ""));
    if (!room || !member) return socket.emit("room:resume-failed", { message: "部屋への再接続情報が見つかりません。" });
    // リロード直後は旧Socketがまだ切断処理中のことがあるため、
    // 同じ再接続トークンを持つ新しいSocketへ接続を引き継ぐ。
    if (member.socketId && member.socketId !== socket.id) {
      const previousSocket = io.sockets.sockets.get(member.socketId);
      if (previousSocket) previousSocket.disconnect(true);
    }
    const wasHost = room.hostSocketId === member.socketId;
    clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null;
    member.socketId = socket.id;
    if (wasHost) room.hostSocketId = socket.id;
    socket.join(room.code);
    socket.data.roomCode = room.code;
    sendRoomSession(socket, room, member);
    sendCurrentRoomState(room);
  });

  socket.on("room:sync", () => {
    const room = getRoom(socket);
    if (!room) return;
    sendCurrentRoomState(room);
  });

  socket.on("room:join", ({ code, name, password } = {}) => {
    if (getRoom(socket)) return sendError(socket, "すでに部屋に参加しています。");
    const room = rooms.get(String(code ?? "").trim());
    if (!room) return sendError(socket, "部屋が見つかりません。");
    if (room.password !== String(password ?? "").slice(0, 64)) return sendError(socket, "パスワードが違います。");
    if (room.game) return sendError(socket, "この部屋のゲームはすでに始まっています。");
    if (room.members.length >= room.playerCount) return sendError(socket, "この部屋は満員です。");
    room.members.push({ socketId: socket.id, playerId: null, name: cleanText(name, "プレイヤー"), admin: false, resumeToken: randomUUID(), disconnectTimer: null });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    sendRoomSession(socket, room, room.members.at(-1));
    sendRoomState(room);
  });

  socket.on("room:leave", () => {
    const room = getRoom(socket);
    if (!room) return;
    removeMember(room, socket.id);
    socket.leave(room.code);
    socket.data.roomCode = null;
  });

  socket.on("room:set-player-count", ({ playerCount, wolfCount, madmanCount, includeIdentityFunction, requireAttackFunctionGuess, anonymousVoting, revealConditionOnAttackFailure, infectedWolfObservationAlwaysNonWolf, limitInvestigatorsPerTarget, maxInvestigatorsPerTarget, soloHumanRole } = {}, acknowledge) => {
    const room = getRoom(socket);
    if (!room || room.hostSocketId !== socket.id) return sendError(socket, "部屋の作成者だけが人数を変更できます。");
    if (room.game && room.phase !== "ended") return sendError(socket, "ゲーム中は人数を変更できません。");
    const totalPlayerCount = parsePlayerCount(playerCount);
    if (totalPlayerCount === null) return sendError(socket, `人数は${MIN_PLAYER_COUNT}〜${MAX_PLAYER_COUNT}人で指定してください。`);
    if (room.members.length > totalPlayerCount) return sendError(socket, "現在の参加者数より少ない人数には変更できません。");
    const totalWolfCount = wolfCount === undefined ? room.wolfCount : parseWolfCount(wolfCount, totalPlayerCount);
    if (totalWolfCount === null) return sendError(socket, `この人数では人狼は1〜${maxWolvesForPlayerCount(totalPlayerCount)}人にしてください。`);
    const totalMadmanCount = madmanCount === undefined
      ? Math.min(room.madmanCount ?? 0, maxMadmenForPlayerCount(totalPlayerCount, totalWolfCount))
      : parseMadmanCount(madmanCount, totalPlayerCount, totalWolfCount);
    if (totalMadmanCount === null) return sendError(socket, `この人数・人狼人数では狂人は0〜${maxMadmenForPlayerCount(totalPlayerCount, totalWolfCount)}人にしてください。`);
    const totalMaxInvestigators = parseMaxInvestigatorsPerTarget(maxInvestigatorsPerTarget, totalPlayerCount, Math.min(room.maxInvestigatorsPerTarget ?? totalPlayerCount, totalPlayerCount));
    if (totalMaxInvestigators === null) return sendError(socket, `同じ対象を占える人数は1〜${totalPlayerCount}人にしてください。`);
    room.playerCount = totalPlayerCount;
    room.wolfCount = totalWolfCount;
    room.madmanCount = totalMadmanCount;
    room.soloHumanRole = parseSoloHumanRole(soloHumanRole, room.soloHumanRole, totalMadmanCount);
    room.maxInvestigatorsPerTarget = totalMaxInvestigators;
    room.includeIdentityFunction = parseRuleBoolean(includeIdentityFunction, room.includeIdentityFunction);
    room.requireAttackFunctionGuess = parseRuleBoolean(requireAttackFunctionGuess, room.requireAttackFunctionGuess);
    room.anonymousVoting = parseRuleBoolean(anonymousVoting, room.anonymousVoting);
    room.revealConditionOnAttackFailure = parseRuleBoolean(revealConditionOnAttackFailure, room.revealConditionOnAttackFailure);
    room.infectedWolfObservationAlwaysNonWolf = parseRuleBoolean(infectedWolfObservationAlwaysNonWolf, room.infectedWolfObservationAlwaysNonWolf);
    room.limitInvestigatorsPerTarget = parseRuleBoolean(limitInvestigatorsPerTarget, room.limitInvestigatorsPerTarget);
    if (room.adminConfig.forceHumanRole === "identity") room.includeIdentityFunction = true;
    sendRoomState(room);
    if (room.game) sendGameState(room);
    acknowledge?.({ ok: true });
  });

  socket.on("room:set-admin-settings", ({ forceHumanRole, trackPosterior } = {}) => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    if (!room || room.hostSocketId !== socket.id || !member?.admin) return sendError(socket, "管理者モードの設定を変更できません。");
    if (room.game && room.phase !== "ended") return sendError(socket, "ゲーム中は管理者設定を変更できません。");
    room.adminConfig = adminConfigFromInput({ forceHumanRole, trackPosterior }, room.adminConfig);
    if (room.adminConfig.forceHumanRole === "identity") room.includeIdentityFunction = true;
    sendRoomState(room);
    if (room.game) sendGameState(room);
  });

  socket.on("room:start", () => {
    const room = getRoom(socket);
    if (!room || room.hostSocketId !== socket.id) return sendError(socket, "部屋の作成者だけが開始できます。");
    if (room.game) return;
    startRoomGame(room);
  });

  socket.on("room:restart", ({ playerCount, wolfCount, madmanCount, includeIdentityFunction, requireAttackFunctionGuess, anonymousVoting, revealConditionOnAttackFailure, infectedWolfObservationAlwaysNonWolf, limitInvestigatorsPerTarget, maxInvestigatorsPerTarget, soloHumanRole, forceHumanRole, trackPosterior } = {}) => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    if (!room || room.hostSocketId !== socket.id) return sendError(socket, "部屋の作成者だけが再戦を開始できます。");
    if (!room.game || room.phase !== "ended") return sendError(socket, "ゲーム終了後に再戦できます。");
    if (playerCount !== undefined) {
      const totalPlayerCount = parsePlayerCount(playerCount);
      if (totalPlayerCount === null) return sendError(socket, `人数は${MIN_PLAYER_COUNT}〜${MAX_PLAYER_COUNT}人で指定してください。`);
      if (room.members.length > totalPlayerCount) return sendError(socket, "現在の参加者数より少ない人数には変更できません。");
      room.playerCount = totalPlayerCount;
    }
    const totalWolfCount = parseWolfCount(wolfCount ?? room.wolfCount, room.playerCount);
    if (totalWolfCount === null) return sendError(socket, `この人数では人狼は1〜${maxWolvesForPlayerCount(room.playerCount)}人にしてください。`);
    const totalMadmanCount = parseMadmanCount(madmanCount ?? room.madmanCount ?? 0, room.playerCount, totalWolfCount);
    if (totalMadmanCount === null) return sendError(socket, `この人数・人狼人数では狂人は0〜${maxMadmenForPlayerCount(room.playerCount, totalWolfCount)}人にしてください。`);
    const totalMaxInvestigators = parseMaxInvestigatorsPerTarget(maxInvestigatorsPerTarget, room.playerCount, Math.min(room.maxInvestigatorsPerTarget ?? room.playerCount, room.playerCount));
    if (totalMaxInvestigators === null) return sendError(socket, `同じ対象を占える人数は1〜${room.playerCount}人にしてください。`);
    room.wolfCount = totalWolfCount;
    room.madmanCount = totalMadmanCount;
    room.soloHumanRole = parseSoloHumanRole(soloHumanRole, room.soloHumanRole, totalMadmanCount);
    room.maxInvestigatorsPerTarget = totalMaxInvestigators;
    room.includeIdentityFunction = parseRuleBoolean(includeIdentityFunction, room.includeIdentityFunction);
    room.requireAttackFunctionGuess = parseRuleBoolean(requireAttackFunctionGuess, room.requireAttackFunctionGuess);
    room.anonymousVoting = parseRuleBoolean(anonymousVoting, room.anonymousVoting);
    room.revealConditionOnAttackFailure = parseRuleBoolean(revealConditionOnAttackFailure, room.revealConditionOnAttackFailure);
    room.infectedWolfObservationAlwaysNonWolf = parseRuleBoolean(infectedWolfObservationAlwaysNonWolf, room.infectedWolfObservationAlwaysNonWolf);
    room.limitInvestigatorsPerTarget = parseRuleBoolean(limitInvestigatorsPerTarget, room.limitInvestigatorsPerTarget);
    if (member?.admin) room.adminConfig = adminConfigFromInput({ forceHumanRole, trackPosterior }, room.adminConfig);
    if (room.adminConfig.forceHumanRole === "identity") room.includeIdentityFunction = true;
    startRoomGame(room);
  });

  socket.on("game:investigate", ({ targetId } = {}) => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    const playerId = member?.playerId;
    const player = getPlayer(room, playerId);
    if (!room?.game || room.phase !== "investigation" || !room.investigationPending.has(playerId) || room.investigationReports.has(playerId)) {
      return sendError(socket, "観測済みか、現在は観測できない状態です。");
    }
    try {
      const report = room.game.investigate(playerId, targetId);
      room.investigationReports.set(playerId, report);
      sendMadmanTruth(room, report);
      sendObservation(room, playerId);
    } catch (error) {
      if (error?.message === "Investigation target is full" && room.game.rules.limitInvestigatorsPerTarget) {
        const hasAlternative = room.game.alivePlayers().some((target) => {
          if (target.id === playerId) return false;
          const claimants = room.game.investigationClaims?.get(target.id) ?? [];
          return claimants.length < room.game.rules.maxInvestigatorsPerTarget;
        });
        // 人間の選択で最後に自分以外の全対象が埋まった場合でも、
        // 観測なしとしてこのプレイヤーを完了扱いにして進行を止めない。
        if (!hasAlternative) {
          room.investigationPending.delete(playerId);
          room.investigationSubmitted.add(playerId);
          if (room.investigationPending.size === 0) finishInvestigation(room);
          else sendGameState(room);
          return sendError(socket, "このラウンドは観測できる対象が残っていないため、観測なしで進みます。");
        }
      }
      sendError(socket, error?.message === "Investigation target is full"
        ? `その対象は上限（${room.game.rules.maxInvestigatorsPerTarget}人）まで占われています。別の対象を選んでください。`
        : "その対象は観測できません。");
    }
  });

  socket.on("game:publish", ({ mode, targetSign, reportedSign, publicTargetId } = {}) => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    const player = getPlayer(room, member?.playerId);
    const report = room?.investigationReports.get(member?.playerId);
    if (!room?.game || room.phase !== "investigation" || !player || !report || !room.investigationPending.has(player.id)) {
      return sendError(socket, "公開できる観測結果がありません。");
    }
    if (mode === "no") {
      room.investigationReports.delete(player.id);
    } else {
      if (player.role === "wolf" || player.role === "madman") {
        const publicTarget = room.game.alivePlayers().find((target) => target.id === (publicTargetId ?? report.target.id) && target.id !== player.id);
        if (!publicTarget) return sendError(socket, "公表する対象を選択してください。");
        chooseReportPublicationTarget(report, publicTarget);
        if (!TARGET_SIGN_KEYS.includes(targetSign)) return sendError(socket, "観測結果を確認してから、公開する目標符号を選択してください。");
        chooseReportTargetSign(report, targetSign);
      }
      if (player.role === "madman" && mode === "custom") {
        if (!TARGET_SIGN_KEYS.includes(reportedSign)) return sendError(socket, "市民に伝える符号を選択してください。");
        const symbol = reportedSign === "positive" ? "+" : reportedSign === "negative" ? "−" : "0";
        report.reportedSign = symbol;
        report.isMatch = reportedSign === report.condition.targetSign;
        report.truthful = report.reportedSign === report.observed.symbol;
      }
      if (mode === "lie" && (player.role === "wolf" || player.role === "madman")) {
        report.isMatch = !report.isMatch;
        const expectedSymbol = report.condition.targetSign === "positive" ? "+" : report.condition.targetSign === "negative" ? "−" : "0";
        const unexpectedSymbol = report.condition.targetSign === "positive" ? "−" : "+";
        report.reportedSign = report.isMatch ? expectedSymbol : unexpectedSymbol;
        report.truthful = false;
      }
      if (mode === "reverse") {
        if (player.role !== "citizen") return sendError(socket, "逆の符号を公開できるのは市民だけです。");
        reverseReport(report);
      }
      room.game.publishReport(report, true);
    }
    room.investigationReports.delete(player.id);
    room.investigationPending.delete(player.id);
    room.investigationSubmitted.add(player.id);
    if (room.investigationPending.size === 0) finishInvestigation(room);
    else sendGameState(room);
  });

  socket.on("game:begin-vote", () => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    if (!room?.game || member?.socketId !== room.hostSocketId || room.phase !== "discussion") return sendError(socket, "投票を開始できません。");
    beginVote(room);
  });

  socket.on("game:vote", ({ choice } = {}) => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    const playerId = member?.playerId;
    if (!room?.game || room.phase !== "vote" || !room.votePending.has(playerId)) return sendError(socket, "投票済みか、現在は投票できない状態です。");
    const alive = room.game.alivePlayers();
    const runoffCandidates = room.voteCandidates ? new Set(room.voteCandidates) : null;
    const valid = runoffCandidates
      ? alive.some((player) => player.id === choice && player.id !== playerId && runoffCandidates.has(player.id))
      : choice === "none" || alive.some((player) => player.id === choice && player.id !== playerId);
    if (!valid) return sendError(socket, "その投票先は選べません。");
    room.humanVotes.set(playerId, choice);
    room.votePending.delete(playerId);
    room.voteSubmitted.add(playerId);
    if (room.votePending.size === 0) finishVote(room);
    else sendGameState(room);
  });

  socket.on("game:begin-night", () => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    if (!room?.game || member?.socketId !== room.hostSocketId || room.phase !== "vote-result") return sendError(socket, "夜を開始できません。");
    beginNight(room);
  });

  socket.on("game:request-night", () => {
    const room = getRoom(socket);
    if (!memberCanAct(room, socket, "night")) return;
    sendNightTurn(room);
  });

  socket.on("game:attack", ({ targetId, functionId } = {}) => {
    const room = getRoom(socket);
    if (!memberCanAct(room, socket, "night") || room.game.primaryWolf?.id !== room.activePlayerId) return sendError(socket, "今は襲撃を選べません。");
    const target = room.game.alivePlayers().find((player) => player.id === targetId && player.role !== "wolf" && !player.infected);
    if (!target) return sendError(socket, "その対象は襲撃できません。");
    if (room.game.rules.requireAttackFunctionGuess) {
      const functionOptions = room.game.knownFunctionOptions();
      if (!functionOptions.some((option) => option.id === functionId)) return sendError(socket, "その関数は推測候補にありません。");
      finishNight(room, target.id, functionId);
    } else {
      finishNight(room, target.id);
    }
  });

  socket.on("game:next-round", () => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    if (!room?.game || member?.socketId !== room.hostSocketId || room.phase !== "night-result") return sendError(socket, "次のラウンドへ進めません。");
    room.game.startNextRound();
    beginInvestigation(room);
  });

  socket.on("chat message", (data) => {
    const room = getRoom(socket);
    if (!room) return;
    io.to(room.code).emit("chat message", {
      sender: getMember(room, socket.id)?.name ?? socket.id,
      message: cleanText(data?.message),
      time: new Date().toLocaleTimeString("ja-JP"),
    });
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket);
    if (!room) return;
    scheduleMemberRemoval(room, socket.id);
  });
});

server.listen(port, host, () => {
  console.log(`TRUTH OR WOLF: http://localhost:${port}`);
});
