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

export function bindEvents({ state, socket, render }) {
  bindWolfLimit(document.querySelector("#player-count"), document.querySelector("#wolf-count"));
  bindWolfLimit(document.querySelector("#room-player-count"), document.querySelector("#room-wolf-count"));
  bindWolfLimit(document.querySelector("#restart-player-count"), document.querySelector("#restart-wolf-count"));
  document.querySelector("#create-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:create", formValues(event.currentTarget));
  });
  document.querySelector("#join-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:join", formValues(event.currentTarget));
  });
  document.querySelector("#leave-room")?.addEventListener("click", () => {
    socket.emit("room:leave"); state.room = null; state.game = null; state.privateAction = null; state.myFunction = null; state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null; state.targetSignChoice = null; render();
  });
  document.querySelector("#start-online-game")?.addEventListener("click", () => socket.emit("room:start"));
  document.querySelector("#room-player-count-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("room:set-player-count", {
      playerCount: event.currentTarget.elements.playerCount.value,
      wolfCount: event.currentTarget.elements.wolfCount.value,
      includeIdentityFunction: document.querySelector("#room-include-identity")?.checked ?? true,
      requireAttackFunctionGuess: document.querySelector("#room-require-attack-guess")?.checked ?? true,
    });
  });
  document.querySelector("#restart-room")?.addEventListener("click", () => {
    socket.emit("room:restart", {
      playerCount: document.querySelector("#restart-player-count")?.value,
      wolfCount: document.querySelector("#restart-wolf-count")?.value,
      includeIdentityFunction: document.querySelector("#restart-include-identity")?.checked ?? true,
      requireAttackFunctionGuess: document.querySelector("#restart-require-attack-guess")?.checked ?? true,
    });
  });
  document.querySelector("#begin-vote")?.addEventListener("click", () => socket.emit("game:begin-vote"));
  document.querySelector("#begin-night")?.addEventListener("click", () => socket.emit("game:begin-night"));
  document.querySelector("#next-round")?.addEventListener("click", () => socket.emit("game:next-round"));
  document.querySelectorAll("[data-investigate]").forEach((button) => button.addEventListener("click", () => socket.emit("game:investigate", { targetId: button.dataset.investigate, targetSign: state.targetSignChoice })));
  document.querySelectorAll("[data-target-sign]").forEach((button) => button.addEventListener("click", () => {
    state.targetSignChoice = button.dataset.targetSign;
    render();
  }));
  document.querySelectorAll("[data-publish]").forEach((button) => button.addEventListener("click", () => { socket.emit("game:publish", { mode: button.dataset.publish }); state.observation = null; }));
  document.querySelector("#start-tutorial-citizen")?.addEventListener("click", () => { state.tutorialMode = true; state.tutorialRole = "citizen"; state.game = null; render(); });
  document.querySelector("#start-tutorial-wolf")?.addEventListener("click", () => { state.tutorialMode = true; state.tutorialRole = "wolf"; state.game = null; render(); });
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
  document.querySelector("#cancel-attack-target")?.addEventListener("click", () => { state.nightTargetId = null; render(); });
}

export function bindSocketEvents({ state, socket, render }) {
  socket.on("connect", () => { state.connected = true; state.error = null; render(); });
  socket.on("disconnect", () => { state.connected = false; state.error = "サーバーとの接続が切れました。再読み込みしてください。"; render(); });
  socket.on("room:update", (room) => { state.room = room; if (room.status === "lobby") { state.game = null; state.myFunction = null; } state.error = null; render(); });
  socket.on("game:state", (game) => {
    const keepPrivateAction = state.game?.phase === game.phase && state.privateAction?.playerId === game.myPlayerId && !game.submitted;
    state.game = game;
    if (!keepPrivateAction) { state.privateAction = null; state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null; state.targetSignChoice = null; }
    state.error = null; render();
  });
  socket.on("game:private", (action) => {
    state.privateAction = action;
    // 自分の関数は届いたタイミングでキャッシュし、投票などその後のフェーズでも左パネルに表示し続ける
    if (action.function) state.myFunction = action.function;
    state.observation = null; state.exileReveal = null; state.attackResult = null; state.nightTargetId = null;
    state.targetSignChoice = action.kind === "investigation" && action.role === "wolf" && action.condition
      ? action.condition.targetSign
      : null;
    render();
  });
  socket.on("game:observation", (observation) => { state.observation = observation; render(); });
  socket.on("game:exile-reveal", (reveal) => { state.exileReveal = reveal; render(); });
  socket.on("game:attack-result", (result) => { state.attackResult = result; render(); });
  socket.on("room:error", ({ message }) => { state.error = message; render(); });
}
