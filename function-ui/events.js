function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function bindEvents({ state, socket, render }) {
  document.querySelector("#create-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:create", formValues(event.currentTarget));
  });
  document.querySelector("#join-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault(); state.error = null; socket.emit("room:join", formValues(event.currentTarget));
  });
  document.querySelector("#leave-room")?.addEventListener("click", () => {
    socket.emit("room:leave"); state.room = null; state.game = null; state.privateAction = null; state.observation = null; state.nightTargetId = null; render();
  });
  document.querySelector("#start-online-game")?.addEventListener("click", () => socket.emit("room:start"));
  document.querySelector("#begin-vote")?.addEventListener("click", () => socket.emit("game:begin-vote"));
  document.querySelector("#begin-night")?.addEventListener("click", () => socket.emit("game:begin-night"));
  document.querySelector("#next-round")?.addEventListener("click", () => socket.emit("game:next-round"));
  document.querySelectorAll("[data-investigate]").forEach((button) => button.addEventListener("click", () => socket.emit("game:investigate", { targetId: button.dataset.investigate })));
  document.querySelectorAll("[data-publish]").forEach((button) => button.addEventListener("click", () => { socket.emit("game:publish", { mode: button.dataset.publish }); state.observation = null; }));
  document.querySelector("#start-tutorial")?.addEventListener("click", () => { state.tutorialMode = true; state.game = null; render(); });
  document.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => socket.emit("game:vote", { choice: button.dataset.vote })));
  document.querySelectorAll("[data-attack-target]").forEach((button) => button.addEventListener("click", () => {
    state.nightTargetId = button.dataset.attackTarget;
    render();
  }));
  document.querySelectorAll("[data-attack-function]").forEach((button) => button.addEventListener("click", () => {
    socket.emit("game:attack", { targetId: state.nightTargetId, functionId: button.dataset.attackFunction });
    state.nightTargetId = null;
  }));
  document.querySelector("#cancel-attack-target")?.addEventListener("click", () => { state.nightTargetId = null; render(); });
}

export function bindSocketEvents({ state, socket, render }) {
  socket.on("connect", () => { state.connected = true; state.error = null; render(); });
  socket.on("disconnect", () => { state.connected = false; state.error = "サーバーとの接続が切れました。再読み込みしてください。"; render(); });
  socket.on("room:update", (room) => { state.room = room; if (room.status === "lobby") state.game = null; state.error = null; render(); });
  socket.on("game:state", (game) => {
    const keepPrivateAction = state.game?.phase === game.phase && state.privateAction?.playerId === game.myPlayerId && !game.submitted;
    state.game = game;
    if (!keepPrivateAction) { state.privateAction = null; state.observation = null; state.nightTargetId = null; }
    state.error = null; render();
  });
  socket.on("game:private", (action) => { state.privateAction = action; state.observation = null; state.nightTargetId = null; render(); });
  socket.on("game:observation", (observation) => { state.observation = observation; render(); });
  socket.on("room:error", ({ message }) => { state.error = message; render(); });
}
