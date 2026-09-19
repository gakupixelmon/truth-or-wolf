function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

const ROOM_SESSION_KEY = "truth-or-wolf:room-session";

function loadRoomSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(ROOM_SESSION_KEY) ?? "null");
    return session?.code && session?.token ? { code: String(session.code), token: String(session.token) } : null;
  } catch {
    return null;
  }
}

function saveRoomSession(session) {
  try {
    sessionStorage.setItem(ROOM_SESSION_KEY, JSON.stringify({ code: session.code, token: session.token }));
  } catch {
    // localStorageが使えない環境でもゲーム自体は継続する。
  }
}

function clearRoomSession() {
  try {
    sessionStorage.removeItem(ROOM_SESSION_KEY);
  } catch {
    // localStorageが使えない環境でも退出処理は継続する。
  }
}

function requestRoomSync(socket) {
  if (!socket.connected || !loadRoomSession()) return;
  socket.emit("room:sync");
}

function acceptGameRevision(state, payload) {
  if (!Number.isInteger(payload?.revision)) return true;
  if (payload.revision < state.gameRevision) return false;
  state.gameRevision = payload.revision;
  return true;
}

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function bindWolfLimit(playerInput, wolfInput) {
  if (!playerInput || !wolfInput) return;
  const sync = () => {
    const max = Math.min(3, Math.max(1, Math.floor((Number(playerInput.value) - 1) / 3)));
    wolfInput.max = String(max);
    if (Number(wolfInput.value) > max) wolfInput.value = String(max);
  };
  playerInput.addEventListener("input", sync);
  sync();
}

function bindMadmanLimit(playerInput, wolfInput, madmanInput) {
  if (!playerInput || !wolfInput || !madmanInput) return;
  const sync = () => {
    const max = Math.min(3, Math.max(0, Number(playerInput.value) - Number(wolfInput.value) - 1));
    madmanInput.max = String(max);
    if (Number(madmanInput.value) > max) madmanInput.value = String(max);
  };
  playerInput.addEventListener("input", sync);
  wolfInput.addEventListener("input", sync);
  sync();
}

function bindInvestigationLimit(playerInput, maxInput) {
  if (!playerInput || !maxInput) return;
  const sync = () => {
    const max = Math.max(1, Number(playerInput.value));
    maxInput.max = String(max);
    if (Number(maxInput.value) > max) maxInput.value = String(max);
  };
  playerInput.addEventListener("input", sync);
  sync();
}

function bindSoloRoleAvailability(madmanInput, roleSelect) {
  if (!madmanInput || !roleSelect) return;
  const madmanOption = roleSelect.querySelector('option[value="madman"]');
  if (!madmanOption) return;
  const sync = () => {
    const available = Number(madmanInput.value) > 0;
    madmanOption.disabled = !available;
    if (!available && roleSelect.value === "madman") roleSelect.value = "random";
  };
  madmanInput.addEventListener("input", sync);
  sync();
}

function roomSettingsValues(form) {
  return {
    playerCount: form?.elements.playerCount?.value,
    wolfCount: form?.elements.wolfCount?.value,
    madmanCount: form?.elements.madmanCount?.value,
    includeIdentityFunction: document.querySelector("#room-include-identity")?.checked ?? true,
    requireAttackFunctionGuess: document.querySelector("#room-require-attack-guess")?.checked ?? true,
    anonymousVoting: document.querySelector("#room-anonymous-voting")?.checked ?? false,
    revealConditionOnAttackFailure: document.querySelector("#room-reveal-failed-attack-condition")?.checked ?? false,
    infectedWolfObservationAlwaysNonWolf: document.querySelector("#room-infected-wolf-observation")?.checked ?? false,
    limitInvestigatorsPerTarget: document.querySelector("#room-limit-investigators")?.checked ?? false,
    maxInvestigatorsPerTarget: document.querySelector("#room-max-investigators")?.value,
    soloHumanRole: document.querySelector("#room-solo-role")?.value ?? "random",
  };
}

export function bindEvents({ state, socket, render }) {
  bindWolfLimit(document.querySelector("#player-count"), document.querySelector("#wolf-count"));
  bindWolfLimit(document.querySelector("#room-player-count"), document.querySelector("#room-wolf-count"));
  bindWolfLimit(document.querySelector("#restart-player-count"), document.querySelector("#restart-wolf-count"));
  bindMadmanLimit(document.querySelector("#room-player-count"), document.querySelector("#room-wolf-count"), document.querySelector("#room-madman-count"));
  bindMadmanLimit(document.querySelector("#restart-player-count"), document.querySelector("#restart-wolf-count"), document.querySelector("#restart-madman-count"));
  bindInvestigationLimit(document.querySelector("#room-player-count"), document.querySelector("#room-max-investigators"));
  bindInvestigationLimit(document.querySelector("#restart-player-count"), document.querySelector("#restart-max-investigators"));
  bindSoloRoleAvailability(document.querySelector("#room-madman-count"), document.querySelector("#room-solo-role"));
  bindSoloRoleAvailability(document.querySelector("#restart-madman-count"), document.querySelector("#restart-solo-role"));
  document.querySelector("#create-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:create", formValues(event.currentTarget));
  });
  document.querySelector("#join-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:join", formValues(event.currentTarget));
  });
  document.querySelector("#leave-room")?.addEventListener("click", () => {
    clearRoomSession(); socket.emit("room:leave"); state.room = null; state.game = null; state.roomRevision = 0; state.gameRevision = 0; state.privateAction = null; state.myFunction = null; state.myCondition = null; state.myRole = null; state.wolfFunctionOptions = null; state.showWolfFunctionList = false; state.madmanTruths = []; state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null; state.targetSignChoice = null; state.reportedSignChoice = null; state.publishTargetId = null; render();
  });
  document.querySelector("#start-online-game")?.addEventListener("click", () => {
    const settingsForm = document.querySelector("#room-player-count-form");
    if (!settingsForm) return socket.emit("room:start");
    socket.emit("room:set-player-count", roomSettingsValues(settingsForm), (result) => {
      if (result?.ok) socket.emit("room:start");
    });
  });
  document.querySelector("#room-player-count-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("room:set-player-count", roomSettingsValues(event.currentTarget));
  });
  document.querySelector("#admin-settings-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("room:set-admin-settings", {
      forceHumanRole: document.querySelector("#admin-force-role")?.value,
      trackPosterior: document.querySelector("#admin-track-posterior")?.checked ?? false,
    });
  });
  document.querySelector("#restart-room")?.addEventListener("click", () => {
    socket.emit("room:restart", {
      playerCount: document.querySelector("#restart-player-count")?.value,
      wolfCount: document.querySelector("#restart-wolf-count")?.value,
      madmanCount: document.querySelector("#restart-madman-count")?.value,
      includeIdentityFunction: document.querySelector("#restart-include-identity")?.checked ?? true,
      requireAttackFunctionGuess: document.querySelector("#restart-require-attack-guess")?.checked ?? true,
      anonymousVoting: document.querySelector("#restart-anonymous-voting")?.checked ?? false,
      revealConditionOnAttackFailure: document.querySelector("#restart-reveal-failed-attack-condition")?.checked ?? false,
      infectedWolfObservationAlwaysNonWolf: document.querySelector("#restart-infected-wolf-observation")?.checked ?? false,
      limitInvestigatorsPerTarget: document.querySelector("#restart-limit-investigators")?.checked ?? false,
      maxInvestigatorsPerTarget: document.querySelector("#restart-max-investigators")?.value,
      soloHumanRole: document.querySelector("#restart-solo-role")?.value ?? "random",
      forceHumanRole: document.querySelector("#restart-force-role")?.value,
      trackPosterior: document.querySelector("#restart-track-posterior")?.checked,
    });
  });
  document.querySelector("#begin-vote")?.addEventListener("click", () => socket.emit("game:begin-vote"));
  document.querySelector("#begin-night")?.addEventListener("click", () => socket.emit("game:begin-night"));
  document.querySelector("#next-round")?.addEventListener("click", () => socket.emit("game:next-round"));
  document.querySelectorAll("[data-investigate]").forEach((button) => button.addEventListener("click", () => socket.emit("game:investigate", { targetId: button.dataset.investigate })));
  document.querySelectorAll("[data-target-sign]").forEach((button) => button.addEventListener("click", () => {
    state.targetSignChoice = button.dataset.targetSign;
    render();
  }));
  document.querySelectorAll("[data-reported-sign]").forEach((button) => button.addEventListener("click", () => {
    state.reportedSignChoice = button.dataset.reportedSign;
    render();
  }));
  document.querySelectorAll("[data-publish-target]").forEach((button) => button.addEventListener("click", () => {
    state.publishTargetId = button.dataset.publishTarget;
    render();
  }));
  document.querySelectorAll("[data-publish]").forEach((button) => button.addEventListener("click", () => { socket.emit("game:publish", { mode: button.dataset.publish, targetSign: state.targetSignChoice, reportedSign: state.reportedSignChoice, publicTargetId: state.publishTargetId }); state.observation = null; }));
  document.querySelector("#start-tutorial-citizen")?.addEventListener("click", () => { state.tutorialMode = true; state.tutorialRole = "citizen"; state.game = null; state.myFunction = null; state.myCondition = null; state.myRole = null; state.wolfFunctionOptions = null; state.showWolfFunctionList = false; state.madmanTruths = []; state.reportedSignChoice = null; state.publishTargetId = null; render(); });
  document.querySelector("#start-tutorial-wolf")?.addEventListener("click", () => { state.tutorialMode = true; state.tutorialRole = "wolf"; state.game = null; state.myFunction = null; state.myCondition = null; state.myRole = null; state.wolfFunctionOptions = null; state.showWolfFunctionList = false; state.madmanTruths = []; state.reportedSignChoice = null; state.publishTargetId = null; render(); });
  document.querySelector("#show-wolf-function-list")?.addEventListener("click", () => { state.showWolfFunctionList = true; render(); });
  document.querySelector("#close-wolf-function-list")?.addEventListener("click", () => { state.showWolfFunctionList = false; render(); });
  document.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => socket.emit("game:vote", { choice: button.dataset.vote })));
  document.querySelectorAll("[data-copy-value]").forEach((button) => button.addEventListener("click", async () => {
    const originalLabel = button.textContent;
    try {
      await copyToClipboard(button.dataset.copyValue ?? "");
      button.textContent = "コピー済み";
    } catch {
      button.textContent = "コピー失敗";
    }
    window.setTimeout(() => { button.textContent = originalLabel; }, 1500);
  }));
  document.querySelectorAll("[data-attack-target]").forEach((button) => button.addEventListener("click", () => {
    state.nightTargetId = button.dataset.attackTarget;
    render();
  }));
  document.querySelectorAll("[data-attack-function]").forEach((button) => button.addEventListener("click", () => {
    socket.emit("game:attack", { targetId: state.nightTargetId, functionId: button.dataset.attackFunction });
    state.nightTargetId = null;
  }));
  document.querySelectorAll("[data-attack-direct]").forEach((button) => button.addEventListener("click", () => {
    socket.emit("game:attack", { targetId: button.dataset.attackDirect });
    state.nightTargetId = null;
  }));
  document.querySelectorAll("[data-attack-back]").forEach((button) => button.addEventListener("click", () => {
    state.nightTargetId = null;
    render();
  }));
}

export function bindSocketEvents({ state, socket, render }) {
  socket.on("connect", () => {
    state.connected = true;
    state.error = null;
    const session = loadRoomSession();
    if (session) socket.emit("room:resume", session);
    render();
  });
  socket.on("disconnect", () => { state.connected = false; state.error = "サーバーとの接続が切れました。再読み込みしてください。"; render(); });
  socket.on("room:session", (session) => saveRoomSession(session));
  socket.on("room:resume-failed", ({ message }) => { clearRoomSession(); state.room = null; state.game = null; state.roomRevision = 0; state.gameRevision = 0; state.error = message ?? "部屋へ再接続できませんでした。"; render(); });
  socket.on("room:update", (room) => {
    if (Number.isInteger(room.revision) && room.revision < state.roomRevision) return;
    if (Number.isInteger(room.revision)) state.roomRevision = room.revision;
    state.room = room;
    if (room.status === "lobby") { state.game = null; state.gameRevision = 0; state.myFunction = null; state.myCondition = null; state.myRole = null; state.wolfFunctionOptions = null; state.showWolfFunctionList = false; state.madmanTruths = []; state.reportedSignChoice = null; state.publishTargetId = null; }
    state.error = null;
    render();
  });
  socket.on("game:state", (game) => {
    if (Number.isInteger(game.revision) && game.revision < state.gameRevision) return;
    if (Number.isInteger(game.revision)) state.gameRevision = game.revision;
    const restarting = state.game?.phase === "ended" && game.phase === "investigation";
    const keepPrivateAction = state.game?.phase === game.phase
      && (state.game?.voteRound ?? 1) === (game.voteRound ?? 1)
      && state.privateAction?.playerId === game.myPlayerId
      && !game.submitted;
    const keepObservation = Number.isInteger(state.observation?.revision)
      && state.observation.revision === game.revision;
    state.game = game;
    if (restarting) {
      state.myFunction = null;
      state.myCondition = null;
      state.myRole = null;
      state.wolfFunctionOptions = null;
      state.showWolfFunctionList = false;
      state.madmanTruths = [];
      state.publishTargetId = null;
    }
    if (!keepPrivateAction) { state.privateAction = null; if (!keepObservation) state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null; state.targetSignChoice = null; state.reportedSignChoice = null; state.publishTargetId = null; }
    state.error = null; render();
  });
  socket.on("game:private", (action) => {
    if (!acceptGameRevision(state, action)) return;
    state.privateAction = action;
    // 自分の関数は届いたタイミングでキャッシュし、投票などその後のフェーズでも左パネルに表示し続ける
    if (action.function) state.myFunction = action.function;
    if (action.condition) state.myCondition = action.condition;
    if (action.role) state.myRole = action.role;
    if ((action.role === "wolf" || action.role === "madman") && Array.isArray(action.functionOptions)) state.wolfFunctionOptions = action.functionOptions;
    if (action.role !== "wolf" && action.role !== "madman") { state.wolfFunctionOptions = null; state.showWolfFunctionList = false; }
    state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null;
    state.targetSignChoice = null;
    state.reportedSignChoice = null;
    state.publishTargetId = null;
    render();
  });
  socket.on("game:identity", (identity) => {
    if (!acceptGameRevision(state, identity)) return;
    if (identity.function) state.myFunction = identity.function;
    if (identity.condition) state.myCondition = identity.condition;
    if (identity.role) state.myRole = identity.role;
    if ((identity.role === "wolf" || identity.role === "madman") && Array.isArray(identity.functionOptions)) state.wolfFunctionOptions = identity.functionOptions;
    if (identity.role !== "wolf" && identity.role !== "madman") { state.wolfFunctionOptions = null; state.showWolfFunctionList = false; }
    render();
  });
  socket.on("game:observation", (observation) => { if (!acceptGameRevision(state, observation)) return; state.observation = observation; state.targetSignChoice = null; state.reportedSignChoice = null; state.publishTargetId = observation.target?.id ?? null; render(); });
  socket.on("game:madman-truth", (truth) => { state.madmanTruths = [...state.madmanTruths, truth]; render(); });
  socket.on("game:exile-reveal", (reveal) => { state.exileReveal = reveal; render(); });
  socket.on("game:attack-result", (result) => { state.attackResult = result; render(); });
  socket.on("room:error", ({ message }) => { state.error = message; render(); });
  // スマホが別アプリから復帰したとき、画面をサーバーの最新状態へ合わせる。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestRoomSync(socket);
  });
  window.addEventListener("pageshow", () => requestRoomSync(socket));
}
