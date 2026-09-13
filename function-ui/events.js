function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
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

export function bindEvents({ state, socket, render }) {
  bindWolfLimit(document.querySelector("#player-count"), document.querySelector("#wolf-count"));
  bindWolfLimit(document.querySelector("#room-player-count"), document.querySelector("#room-wolf-count"));
  bindWolfLimit(document.querySelector("#restart-player-count"), document.querySelector("#restart-wolf-count"));
  bindMadmanLimit(document.querySelector("#room-player-count"), document.querySelector("#room-wolf-count"), document.querySelector("#room-madman-count"));
  bindMadmanLimit(document.querySelector("#restart-player-count"), document.querySelector("#restart-wolf-count"), document.querySelector("#restart-madman-count"));
  bindInvestigationLimit(document.querySelector("#room-player-count"), document.querySelector("#room-max-investigators"));
  bindInvestigationLimit(document.querySelector("#restart-player-count"), document.querySelector("#restart-max-investigators"));
  document.querySelector("#create-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:create", formValues(event.currentTarget));
  });
  document.querySelector("#join-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:join", formValues(event.currentTarget));
  });
  document.querySelector("#leave-room")?.addEventListener("click", () => {
    socket.emit("room:leave"); state.room = null; state.game = null; state.privateAction = null; state.myFunction = null; state.myCondition = null; state.myRole = null; state.wolfFunctionOptions = null; state.showWolfFunctionList = false; state.madmanTruths = []; state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null; state.targetSignChoice = null; state.reportedSignChoice = null; state.publishTargetId = null; render();
  });
  document.querySelector("#start-online-game")?.addEventListener("click", () => socket.emit("room:start"));
  document.querySelector("#room-player-count-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("room:set-player-count", {
      playerCount: event.currentTarget.elements.playerCount.value,
      wolfCount: event.currentTarget.elements.wolfCount.value,
      madmanCount: event.currentTarget.elements.madmanCount.value,
      includeIdentityFunction: document.querySelector("#room-include-identity")?.checked ?? true,
      requireAttackFunctionGuess: document.querySelector("#room-require-attack-guess")?.checked ?? true,
      anonymousVoting: document.querySelector("#room-anonymous-voting")?.checked ?? false,
      revealConditionOnAttackFailure: document.querySelector("#room-reveal-failed-attack-condition")?.checked ?? false,
      infectedWolfObservationAlwaysNonWolf: document.querySelector("#room-infected-wolf-observation")?.checked ?? false,
      limitInvestigatorsPerTarget: document.querySelector("#room-limit-investigators")?.checked ?? false,
      maxInvestigatorsPerTarget: document.querySelector("#room-max-investigators")?.value,
    });
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
  socket.on("connect", () => { state.connected = true; state.error = null; render(); });
  socket.on("disconnect", () => { state.connected = false; state.error = "サーバーとの接続が切れました。再読み込みしてください。"; render(); });
  socket.on("room:update", (room) => { state.room = room; if (room.status === "lobby") { state.game = null; state.myFunction = null; state.myCondition = null; state.myRole = null; state.wolfFunctionOptions = null; state.showWolfFunctionList = false; state.madmanTruths = []; state.reportedSignChoice = null; state.publishTargetId = null; } state.error = null; render(); });
  socket.on("game:state", (game) => {
    const restarting = state.game?.phase === "ended" && game.phase === "investigation";
    const keepPrivateAction = state.game?.phase === game.phase
      && (state.game?.voteRound ?? 1) === (game.voteRound ?? 1)
      && state.privateAction?.playerId === game.myPlayerId
      && !game.submitted;
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
    if (!keepPrivateAction) { state.privateAction = null; state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null; state.targetSignChoice = null; state.reportedSignChoice = null; state.publishTargetId = null; }
    state.error = null; render();
  });
  socket.on("game:private", (action) => {
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
  socket.on("game:observation", (observation) => { state.observation = observation; state.targetSignChoice = null; state.reportedSignChoice = null; state.publishTargetId = observation.target?.id ?? null; render(); });
  socket.on("game:madman-truth", (truth) => { state.madmanTruths = [...state.madmanTruths, truth]; render(); });
  socket.on("game:exile-reveal", (reveal) => { state.exileReveal = reveal; render(); });
  socket.on("game:attack-result", (result) => { state.attackResult = result; render(); });
  socket.on("room:error", ({ message }) => { state.error = message; render(); });
}
