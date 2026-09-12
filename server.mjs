import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomInt, timingSafeEqual } from "node:crypto";
import { Server } from "socket.io";
import { FunctionWolfGame } from "./function-game.js";
import { DEFAULT_PLAYER_COUNT, DEFAULT_RULES, MAX_PLAYER_COUNT, MAX_WOLF_COUNT, MIN_PLAYER_COUNT } from "./rules/constants.js";
import { TARGET_SIGN_KEYS } from "./rules/investigation.js";

try {
  process.loadEnvFile?.();
} catch {
  // .env is optional; deployment environments can provide variables directly.
}

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4173);
const adminEntryKey = String(process.env.TRUTH_OR_WOLF_ADMIN_KEY || "").trim();
const DEFAULT_ADMIN_CONFIG = Object.freeze({ forceHumanRole: "random", trackPosterior: false });
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

function parseRuleBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === false) return value;
  return value === "true" || value === "1" || value === "on";
}

function roomRules(room) {
  return {
    includeIdentityFunction: room.includeIdentityFunction,
    requireAttackFunctionGuess: room.requireAttackFunctionGuess,
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
  return {
    votes: result.votes,
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
    myPlayerId: member?.playerId ?? null,
    isHost: member?.socketId === room.hostSocketId,
    admin: member?.admin === true,
    playerCount: game.players.length,
    wolfCount: game.wolfCount,
    rules: game.rules,
    posteriorHistory: member?.admin === true && game.trackPosterior ? game.posteriorHistory : null,
  };
}

function roomState(room, socketId) {
  const member = getMember(room, socketId);
  return {
    code: room.code,
    // パスワードは部屋作成者本人にだけ返す。
    password: member?.socketId === room.hostSocketId ? room.password : null,
    playerCount: room.playerCount,
    wolfCount: room.wolfCount,
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
  for (const member of room.members) {
    io.to(member.socketId).emit("room:update", roomState(room, member.socketId));
  }
}

function sendGameState(room) {
  if (!room.game) return;
  for (const member of room.members) {
    io.to(member.socketId).emit("game:state", gameState(room, member.socketId));
  }
}

function sendError(socket, message) {
  socket.emit("room:error", { message });
}

function privatePlayerData(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player) return null;
  return {
    playerId: player.id,
    name: player.name,
    role: player.role,
    function: {
      label: player.baseFunction.label,
      table: room.game.privateFunctionTable(player),
    },
    condition: {
      label: player.condition.label,
      targetSign: player.condition.targetSign,
    },
    targetSignOptions: player.role === "wolf" ? [...TARGET_SIGN_KEYS] : [],
  };
}

function sendInvestigationTurns(room) {
  for (const player of room.game.getHumanActors().filter((candidate) => candidate.alive)) {
    if (!room.investigationPending.has(player.id)) continue;
    const member = room.members.find((entry) => entry.playerId === player.id);
    if (!member) continue;
    io.to(member.socketId).emit("game:private", {
      kind: "investigation",
      ...privatePlayerData(room, player.id),
      targets: room.game.alivePlayers()
        .filter((target) => target.id !== player.id)
        .map((target) => ({ id: target.id, name: target.name })),
    });
  }
}

function sendVoteTurns(room) {
  for (const player of room.game.getHumanActors().filter((candidate) => candidate.alive)) {
    if (!room.votePending.has(player.id)) continue;
    const member = room.members.find((entry) => entry.playerId === player.id);
    if (!member) continue;
    io.to(member.socketId).emit("game:private", {
      kind: "vote",
      ...privatePlayerData(room, player.id),
      targets: room.game.alivePlayers()
        .filter((target) => target.id !== player.id)
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

function sendNightTurn(room) {
  const player = room.game.primaryWolf;
  const member = room.members.find((entry) => entry.playerId === player?.id);
  if (!player || !member) return;
  io.to(member.socketId).emit("game:private", {
    kind: "night",
    playerId: player.id,
    name: player.name,
    role: player.role,
    targets: room.game.alivePlayers()
      .filter((target) => target.role !== "wolf" && !target.infected)
      .map((target) => ({ id: target.id, name: target.name })),
    // 人狼には関数の種類だけを渡す。どのプレイヤーが持つかは渡さない。
    functionOptions: room.game.rules.requireAttackFunctionGuess ? room.game.knownFunctionOptions() : [],
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
  room.game.runCpuInvestigations();
  room.phase = "discussion";
  room.activePlayerId = null;
  room.investigationPending = new Set();
  room.investigationReports = new Map();
  sendGameState(room);
}

function beginVote(room) {
  room.phase = "vote";
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
  const result = room.game.resolveVotes(room.humanVotes);
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
  const wolf = room.game.primaryWolf;
  const member = room.members.find((entry) => entry.playerId === wolf?.id);
  if (member && result) {
    io.to(member.socketId).emit("game:attack-result", { success: result.success });
  }
}

function memberCanAct(room, socket, expectedPhase) {
  const member = getMember(room, socket.id);
  return Boolean(room?.game && room.phase === expectedPhase && member && member.playerId === room.activePlayerId);
}

function clearRoomIfEmpty(room) {
  if (room.members.length === 0) rooms.delete(room.code);
}

function removeMember(room, socketId) {
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
  room.game = new FunctionWolfGame({
    humanCount: room.members.length,
    playerCount: room.playerCount,
    wolfCount: room.wolfCount,
    includeIdentityFunction: room.includeIdentityFunction,
    requireAttackFunctionGuess: room.requireAttackFunctionGuess,
    forceHumanRole: room.adminConfig.forceHumanRole,
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
  socket.on("room:create", ({ name, password, playerCount, wolfCount, includeIdentityFunction, requireAttackFunctionGuess } = {}) => {
    if (getRoom(socket)) return sendError(socket, "すでに部屋に参加しています。");
    const admin = isAdminEntry(name);
    const playerName = admin ? "管理者" : cleanText(name, "プレイヤー");
    const totalPlayerCount = parsePlayerCount(playerCount) ?? DEFAULT_PLAYER_COUNT;
    const totalWolfCount = parseWolfCount(wolfCount, totalPlayerCount) ?? 1;
    const room = {
      code: makeRoomCode(),
      password: String(password ?? "").slice(0, 64),
      playerCount: totalPlayerCount,
      wolfCount: totalWolfCount,
      includeIdentityFunction: parseRuleBoolean(includeIdentityFunction, DEFAULT_RULES.includeIdentityFunction),
      requireAttackFunctionGuess: parseRuleBoolean(requireAttackFunctionGuess, DEFAULT_RULES.requireAttackFunctionGuess),
      adminConfig: { ...DEFAULT_ADMIN_CONFIG },
      hostSocketId: socket.id,
      members: [{ socketId: socket.id, playerId: null, name: playerName, admin }],
      game: null,
      phase: "lobby",
      activePlayerId: null,
      investigationPending: new Set(),
      investigationSubmitted: new Set(),
      investigationReports: new Map(),
      votePending: new Set(),
      voteSubmitted: new Set(),
    };
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    sendRoomState(room);
  });

  socket.on("room:join", ({ code, name, password } = {}) => {
    if (getRoom(socket)) return sendError(socket, "すでに部屋に参加しています。");
    const room = rooms.get(String(code ?? "").trim());
    if (!room) return sendError(socket, "部屋が見つかりません。");
    if (room.password !== String(password ?? "").slice(0, 64)) return sendError(socket, "パスワードが違います。");
    if (room.game) return sendError(socket, "この部屋のゲームはすでに始まっています。");
    if (room.members.length >= room.playerCount) return sendError(socket, "この部屋は満員です。");
    room.members.push({ socketId: socket.id, playerId: null, name: cleanText(name, "プレイヤー"), admin: false });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    sendRoomState(room);
  });

  socket.on("room:leave", () => {
    const room = getRoom(socket);
    if (!room) return;
    removeMember(room, socket.id);
    socket.leave(room.code);
    socket.data.roomCode = null;
  });

  socket.on("room:set-player-count", ({ playerCount, wolfCount, includeIdentityFunction, requireAttackFunctionGuess } = {}) => {
    const room = getRoom(socket);
    if (!room || room.hostSocketId !== socket.id) return sendError(socket, "部屋の作成者だけが人数を変更できます。");
    if (room.game && room.phase !== "ended") return sendError(socket, "ゲーム中は人数を変更できません。");
    const totalPlayerCount = parsePlayerCount(playerCount);
    if (totalPlayerCount === null) return sendError(socket, `人数は${MIN_PLAYER_COUNT}〜${MAX_PLAYER_COUNT}人で指定してください。`);
    if (room.members.length > totalPlayerCount) return sendError(socket, "現在の参加者数より少ない人数には変更できません。");
    const totalWolfCount = wolfCount === undefined ? room.wolfCount : parseWolfCount(wolfCount, totalPlayerCount);
    if (totalWolfCount === null) return sendError(socket, `この人数では人狼は1〜${maxWolvesForPlayerCount(totalPlayerCount)}人にしてください。`);
    room.playerCount = totalPlayerCount;
    room.wolfCount = totalWolfCount;
    room.includeIdentityFunction = parseRuleBoolean(includeIdentityFunction, room.includeIdentityFunction);
    room.requireAttackFunctionGuess = parseRuleBoolean(requireAttackFunctionGuess, room.requireAttackFunctionGuess);
    if (room.adminConfig.forceHumanRole === "identity") room.includeIdentityFunction = true;
    sendRoomState(room);
    if (room.game) sendGameState(room);
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

  socket.on("room:restart", ({ playerCount, wolfCount, includeIdentityFunction, requireAttackFunctionGuess, forceHumanRole, trackPosterior } = {}) => {
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
    room.wolfCount = totalWolfCount;
    room.includeIdentityFunction = parseRuleBoolean(includeIdentityFunction, room.includeIdentityFunction);
    room.requireAttackFunctionGuess = parseRuleBoolean(requireAttackFunctionGuess, room.requireAttackFunctionGuess);
    if (member?.admin) room.adminConfig = adminConfigFromInput({ forceHumanRole, trackPosterior }, room.adminConfig);
    if (room.adminConfig.forceHumanRole === "identity") room.includeIdentityFunction = true;
    startRoomGame(room);
  });

  socket.on("game:investigate", ({ targetId, targetSign } = {}) => {
    const room = getRoom(socket);
    const member = getMember(room, socket.id);
    const playerId = member?.playerId;
    const player = getPlayer(room, playerId);
    if (!room?.game || room.phase !== "investigation" || !room.investigationPending.has(playerId) || room.investigationReports.has(playerId)) {
      return sendError(socket, "観測済みか、現在は観測できない状態です。");
    }
    try {
      const selectedTargetSign = player.role === "wolf" && TARGET_SIGN_KEYS.includes(targetSign)
        ? targetSign
        : undefined;
      const report = room.game.investigate(playerId, targetId, selectedTargetSign);
      room.investigationReports.set(playerId, report);
      socket.emit("game:observation", {
        target: { id: report.target.id, name: report.target.name },
        condition: { label: report.condition.label, targetSign: report.targetSign },
        observed: report.observed,
        targetSign: report.targetSign,
        isMatch: report.isMatch,
        reportedSign: report.reportedSign,
        truthful: true,
      });
    } catch {
      sendError(socket, "その対象は観測できません。");
    }
  });

  socket.on("game:publish", ({ mode } = {}) => {
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
      if (mode === "lie" && player.role === "wolf") {
      report.isMatch = !report.isMatch;
      const expectedSymbol = report.condition.targetSign === "positive" ? "+" : report.condition.targetSign === "negative" ? "−" : "0";
      const unexpectedSymbol = report.condition.targetSign === "positive" ? "−" : "+";
      report.reportedSign = report.isMatch ? expectedSymbol : unexpectedSymbol;
      report.truthful = false;
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
    const valid = choice === "none" || alive.some((player) => player.id === choice && player.id !== playerId);
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
    removeMember(room, socket.id);
  });
});

server.listen(port, host, () => {
  console.log(`TRUTH OR WOLF: http://localhost:${port}`);
});
