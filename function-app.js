const socket = io();
const app = document.querySelector("#app");

const state = {
  connected: false,
  room: null,
  game: null,
  privateAction: null,
  observation: null,
  error: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function signText(sign) {
  return sign === "positive" ? "正" : sign === "negative" ? "負" : "零";
}

function phaseLabel(phase) {
  return ({
    investigation: "観測",
    discussion: "公開議論",
    vote: "投票",
    "vote-result": "投票結果",
    night: "夜",
    "night-result": "夜明け",
    ended: "終了",
  })[phase] ?? phase;
}

function header() {
  const game = state.game;
  const room = state.room;
  const status = game
    ? `<div class="status-line"><span class="status-dot"></span><b>ROOM ${escapeHtml(room?.code)}</b><span>ROUND ${game.round}</span><span class="hide-mobile">${phaseLabel(game.phase)} · 生存 ${game.players.filter((player) => player.alive).length}/7</span></div>`
    : room
      ? `<div class="status-line"><span class="status-dot"></span><b>ROOM ${escapeHtml(room.code)}</b><span>${room.status === "lobby" ? "待機中" : "接続中"}</span></div>`
      : `<a class="mode-link" href="./classic.html">クラシック論理版 →</a>`;
  return `<header class="topbar"><div class="brand"><div class="brand-mark"><span>∘</span></div><div><div class="brand-name">TRUTH OR WOLF</div><div class="brand-sub">ONLINE FUNCTION PROTOCOL</div></div></div>${status}</header>`;
}

function errorMarkup() {
  return state.error ? `<div class="room-error">${escapeHtml(state.error)}</div>` : "";
}

function setupScreen() {
  return `<div class="shell">${header()}<main class="hero function-hero"><section>
    <div class="eyebrow">Function composition × hidden infection</div>
    <h1>部屋を作り、<br><em>推理する。</em></h1>
    <p class="hero-copy">部屋コードとパスワードを共有して、離れた場所のプレイヤーと関数人狼を遊べます。ゲームの秘密情報はサーバーで管理され、各プレイヤーには自分の情報だけが届きます。</p>
    ${errorMarkup()}<div class="room-forms">
      <form class="room-form" id="create-room-form"><div class="panel-kicker">CREATE ROOM</div><input name="name" maxlength="24" placeholder="あなたの名前" required><input name="password" type="password" maxlength="64" placeholder="パスワード" required><button class="primary-button" type="submit">部屋を作る</button></form>
      <form class="room-form" id="join-room-form"><div class="panel-kicker">JOIN ROOM</div><input name="name" maxlength="24" placeholder="あなたの名前" required><input name="code" inputmode="numeric" maxlength="6" placeholder="6桁の部屋コード" required><input name="password" type="password" maxlength="64" placeholder="パスワード" required><button class="secondary-button" type="submit">部屋に入る</button></form>
    </div></section><aside><div class="axiom-card"><div class="axiom-index">ONLINE / W</div><div class="formula-stack"><div class="main-equation">Tᵢ(j) = Obsᵢ(Fᵢ ∘ Fⱼ)</div><div class="sub-equation">Fwolf = W</div></div><div class="axiom-rule">1つの部屋に最大7人。足りない席はCPUが担当します。人狼関数Wは全員に公開されますが、個人関数と秘密条件は本人だけが知ります。</div><div class="feature-list"><div class="feature"><b>ルーム制</b>コードとパスワードで参加</div><div class="feature"><b>秘密情報</b>サーバーが個別に配信</div><div class="feature"><b>同時操作</b>全員が自分の端末から送信</div><div class="feature"><b>CPU補充</b>空席は自動で参加</div></div></div></aside></main></div>`;
}

function lobbyScreen() {
  const room = state.room;
  return `<div class="shell">${header()}<main class="pass-screen"><div class="pass-card room-lobby"><div class="pass-icon">∴</div><div class="eyebrow">Room waiting room</div><h2>部屋 ${escapeHtml(room.code)}</h2><p>このコードとパスワードを参加者に共有してください。最大7人まで参加できます。</p><div class="room-members">${room.players.map((player) => `<div class="room-member"><span>${escapeHtml(player.name)}</span><small>${player.isHost ? "HOST" : "参加者"}${player.connected ? " · 接続中" : " · 切断"}</small></div>`).join("")}</div>${room.isHost ? `<button class="primary-button" id="start-online-game">ゲームを開始</button>` : `<div class="waiting-note">作成者がゲームを開始するまでお待ちください。</div>`}<button class="secondary-button" id="leave-room">部屋を退出</button>${errorMarkup()}</div></main></div>`;
}

function functionPlayer(player) {
  const mine = state.game.myPlayerId === player.id;
  return `<div class="function-player ${player.alive ? "" : "dead"}"><div class="function-player-top"><span class="function-player-name">${player.alive ? "" : "† "}${escapeHtml(player.name)}${mine ? "（あなた）" : ""}</span>${player.human ? `<span class="human-badge">ONLINE</span>` : `<span class="human-badge">CPU</span>`}</div><div class="function-expression">F${player.id.slice(1)}(x) = ?</div><div class="function-family">秘密関数は本人だけが知る</div></div>`;
}

function leftPanel() {
  const game = state.game;
  return `<aside class="function-left"><section class="panel omega-card"><div class="panel-kicker">Known wolf function</div><div class="panel-title">人狼関数 W</div><div class="omega-expression">${escapeHtml(game.omegaLabel)}</div><div class="omega-note">この定義だけは全員の共通知識です。元の人狼は、この関数そのものを持っています。</div><div class="omega-symbol">W</div></section><section class="panel"><div class="panel-head"><div class="panel-kicker">Players</div><div class="panel-title">参加者</div></div><div class="function-roster">${game.players.map(functionPlayer).join("")}</div></section></aside>`;
}

function reportsMarkup() {
  if (!state.game.reports.length) return `<div class="report-empty">公開された観測結果はまだありません。</div>`;
  return `<div class="reports">${[...state.game.reports].reverse().map((report) => `<div class="report"><div class="report-head"><span>ROUND ${report.round} · ${escapeHtml(report.observerName)} → ${escapeHtml(report.targetName)}</span><span>REPORT</span></div><div class="report-formula">sgn(F<sub>${escapeHtml(report.observerName)}</sub> ∘ F<sub>${escapeHtml(report.targetName)}</sub>) = ${escapeHtml(report.reportedSign)}</div><div class="message-gloss">「私の合成演算の符号は ${escapeHtml(report.reportedSign)} だった」</div></div>`).join("")}</div>`;
}

function waitingCard(title, body) {
  return `<div class="action-card waiting-card"><span class="private-role">WAITING</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><div class="result-value">接続中のプレイヤーの操作を待っています</div></div>`;
}

function privateFunctionMarkup(action) {
  if (!action.function) return "";
  return `<div class="condition-box"><div class="condition-label">YOUR PRIVATE FUNCTION</div><div class="condition-value">${escapeHtml(action.function.label)}</div><div class="function-vector">[ ${action.function.table.join(" ")} ]</div></div>`;
}

function investigationView() {
  const action = state.privateAction;
  if (state.game.submitted) return waitingCard("観測を送信しました", "他のプレイヤーの観測が揃うまでお待ちください。");
  if (!action || action.kind !== "investigation" || action.playerId !== state.game.myPlayerId) return waitingCard("他のプレイヤーの観測中", "自分の観測を送信すると、他の人を待たずに待機できます。");
  const targetSignText = signText(action.condition.targetSign);
  return `<div class="action-card"><span class="private-role">${action.role === "wolf" ? "元の人狼" : "市民"}</span><h3>あなたの秘密観測</h3><p>自分の関数を外側、指名相手の関数を内側として合成します。結果の符号だけを公開できます。目標符号は「${targetSignText}」です。</p>${privateFunctionMarkup(action)}<div class="condition-box"><div class="condition-label">YOUR TEST</div><div class="condition-value">${escapeHtml(action.condition.label)}</div></div><div class="target-grid function-targets">${action.targets.map((target) => `<button class="target-button" data-investigate="${escapeHtml(target.id)}">${escapeHtml(target.name)}<span class="function-mini">秘密関数</span></button>`).join("")}</div></div>`;
}

function observationView() {
  const report = state.observation;
  if (!report) return investigationView();
  return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${escapeHtml(report.target.name)}の合成演算</h3><p>目標符号は「${signText(report.condition.targetSign)}」。この一件だけでは偽陽性と区別できません。公開されるのは符号だけです。</p><div class="condition-box"><div class="condition-label">Fself ∘ Ftarget</div><div class="condition-value">${escapeHtml(report.condition.label)}</div></div><div class="result-value">${escapeHtml(report.observed.display)}</div><div class="action-buttons"><button class="primary-button" data-publish="yes">符号を公開する</button>${state.privateAction?.role === "wolf" ? `<button class="danger-button" data-publish="lie">逆の符号を公開</button>` : ""}<button class="secondary-button" data-publish="no">結果を伏せる</button></div></div>`;
}

function discussionView() {
  return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>符号の公開</h2><p>公開された符号が目標符号と一致していても、市民による偽陽性の可能性があります。複数の結果を組み合わせてください。</p></div>${reportsMarkup()}<div class="action-buttons">${state.game.isHost ? `<button class="primary-button" id="begin-vote">投票を開始</button>` : `<span class="waiting-note">部屋主が投票を開始します</span>`}</div>`;
}

function voteView() {
  const action = state.privateAction;
  if (state.game.submitted) return waitingCard("投票を送信しました", "他のプレイヤーの投票が揃うまでお待ちください。");
  if (!action || action.kind !== "vote" || action.playerId !== state.game.myPlayerId) return waitingCard("他のプレイヤーの投票中", "自分の投票を送信すると、他の人を待たずに待機できます。");
  return `<div class="action-card"><span class="private-role">${action.role === "wolf" ? "元の人狼" : "市民"}</span><h3>あなたの投票</h3><p>追放する相手を選んでください。追放しないこともできます。</p><div class="target-grid function-targets">${action.targets.map((target) => `<button class="target-button" data-vote="${escapeHtml(target.id)}">${escapeHtml(target.name)}</button>`).join("")}<button class="target-button" data-vote="none">∅ 追放しない</button></div></div>`;
}

function tallyMarkup(result) {
  if (!result) return "";
  const total = Object.values(result.tally).reduce((sum, value) => sum + value, 0);
  return `<div class="tally">${Object.entries(result.tally).sort((a, b) => b[1] - a[1]).map(([choice, count]) => {
    const label = choice === "none" ? "追放しない" : state.game.players.find((player) => player.id === choice)?.name ?? choice;
    return `<div class="tally-row"><span>${escapeHtml(label)}</span><div class="tally-bar"><div class="tally-fill" style="width:${total ? count / total * 100 : 0}%"></div></div><b>${count}</b></div>`;
  }).join("")}</div>`;
}

function voteResultView() {
  const result = state.game.voteResult;
  const text = result?.exiled ? `${result.exiled.name}が追放されました。${result.exiled.role === "wolf" ? "元の人狼でした。" : "元の人狼ではありませんでした。"}` : "この日は誰も追放されませんでした。";
  return `<div class="action-card"><span class="private-role">VOTE RESULT</span><h3>投票結果</h3><p>${escapeHtml(text)}</p>${tallyMarkup(result)}<div class="action-buttons">${state.game.isHost ? `<button class="primary-button" id="begin-night">夜へ進む</button>` : `<span class="waiting-note">部屋主が夜を開始します</span>`}</div></div>`;
}

function nightView() {
  const action = state.privateAction;
  if (!action || action.kind !== "night" || action.playerId !== state.game.myPlayerId) return waitingCard("夜の処理中", "人狼が襲撃先を選ぶまでお待ちください。");
  return `<div class="action-card"><span class="private-role">元の人狼</span><h3>襲撃対象を選ぶ</h3><p>選んだ市民の関数は、本人に知られないまま W と合成されます。</p><div class="target-grid function-targets">${action.targets.map((target) => `<button class="target-button" data-attack="${escapeHtml(target.id)}">${escapeHtml(target.name)}<span class="function-mini">秘密関数</span></button>`).join("")}</div></div>`;
}

function nightResultView() {
  return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3><p>生存者一人の関数に W が秘密裏に合成されました。対象者自身も、その変化を知りません。</p><div class="result-value">Fᵢ′ = W ∘ Fᵢ</div><div class="action-buttons">${state.game.isHost ? `<button class="primary-button" id="next-round">ROUND ${state.game.round + 1}へ</button>` : `<span class="waiting-note">部屋主が次のラウンドを開始します</span>`}</div></div>`;
}

function outcomeModal() {
  const outcome = state.game.outcome;
  if (!outcome) return "";
  const reveal = (state.game.reveal ?? []).map((player) => `<div class="outcome-person"><b>${escapeHtml(player.name)}</b><span>${player.role === "wolf" ? "元の人狼" : player.infected ? "襲撃済み市民" : "市民"}<br>${escapeHtml(player.functionLabel)}</span></div>`).join("");
  return `<div class="modal-backdrop"><div class="modal"><div class="modal-icon">${outcome.winner === "citizen" ? "∴" : "W"}</div><div class="eyebrow">Protocol concluded</div><h2>${outcome.winner === "citizen" ? "市民側の勝利" : "人狼側の勝利"}</h2><p>${escapeHtml(outcome.reason)}</p><div class="outcome-reveal">${reveal}</div><p class="waiting-note">部屋を退出すると、別の部屋に参加できます。</p><button class="primary-button" id="leave-room">部屋を退出</button></div></div>`;
}

function rightPanel() {
  const progress = state.game.phase === "investigation" || state.game.phase === "vote"
    ? `未送信 ${state.game.pendingCount}人`
    : state.game.activePlayerName ? `${state.game.activePlayerName}の操作中` : "公開情報";
  return `<aside class="function-right"><section class="panel"><div class="panel-head"><div class="panel-kicker">Protocol</div><div class="panel-title">進行状況</div></div><div class="rule-list"><div class="rule-item"><div class="rule-number">ROOM</div><div class="rule-text">${escapeHtml(state.room.code)} · ${escapeHtml(progress)}</div></div><div class="rule-item"><div class="rule-number">01</div><div class="rule-text">Wを個人関数として持つ元人狼を追放すれば市民側の勝利。</div></div><div class="rule-item"><div class="rule-number">02</div><div class="rule-text">調査は Fself ∘ Ftarget を秘密条件で評価する。</div></div><div class="rule-item"><div class="rule-number">03</div><div class="rule-text">襲撃済み市民の投票は元人狼の投票先へ自動置換。</div></div></div></section></aside>`;
}

function mainContent() {
  if (state.game.phase === "investigation") return state.observation ? observationView() : investigationView();
  if (state.game.phase === "discussion") return discussionView();
  if (state.game.phase === "vote") return voteView();
  if (state.game.phase === "vote-result") return voteResultView();
  if (state.game.phase === "night") return nightView();
  if (state.game.phase === "night-result") return nightResultView();
  return waitingCard("ゲーム終了", "結果を確認してください。");
}

function board() {
  const game = state.game;
  return `<div class="shell">${header()}<div class="function-board">${leftPanel()}<main class="panel function-main"><div class="panel-head discussion-head"><div><div class="panel-kicker">Function village · ROOM ${escapeHtml(state.room.code)}</div><div class="panel-title">ROUND ${game.round}</div></div><div class="phase-badge">${phaseLabel(game.phase)}</div></div><div class="function-main-body">${errorMarkup()}${mainContent()}</div></main>${rightPanel()}</div>${outcomeModal()}</div>`;
}

function render() {
  if (!state.room) app.innerHTML = setupScreen();
  else if (!state.game) app.innerHTML = lobbyScreen();
  else app.innerHTML = board();
  bindEvents();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function bindEvents() {
  document.querySelector("#create-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.error = null;
    socket.emit("room:create", formValues(event.currentTarget));
  });
  document.querySelector("#join-room-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.error = null;
    socket.emit("room:join", formValues(event.currentTarget));
  });
  document.querySelector("#leave-room")?.addEventListener("click", () => {
    socket.emit("room:leave");
    state.room = null;
    state.game = null;
    state.privateAction = null;
    state.observation = null;
    render();
  });
  document.querySelector("#start-online-game")?.addEventListener("click", () => socket.emit("room:start"));
  document.querySelector("#begin-vote")?.addEventListener("click", () => socket.emit("game:begin-vote"));
  document.querySelector("#begin-night")?.addEventListener("click", () => socket.emit("game:begin-night"));
  document.querySelector("#next-round")?.addEventListener("click", () => socket.emit("game:next-round"));
  document.querySelectorAll("[data-investigate]").forEach((button) => button.addEventListener("click", () => socket.emit("game:investigate", { targetId: button.dataset.investigate })));
  document.querySelectorAll("[data-publish]").forEach((button) => button.addEventListener("click", () => {
    socket.emit("game:publish", { mode: button.dataset.publish });
    state.observation = null;
  }));
  document.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => socket.emit("game:vote", { choice: button.dataset.vote })));
  document.querySelectorAll("[data-attack]").forEach((button) => button.addEventListener("click", () => socket.emit("game:attack", { targetId: button.dataset.attack })));
}

socket.on("connect", () => {
  state.connected = true;
  state.error = null;
  render();
});

socket.on("disconnect", () => {
  state.connected = false;
  state.error = "サーバーとの接続が切れました。再読み込みしてください。";
  render();
});

socket.on("room:update", (room) => {
  state.room = room;
  if (room.status === "lobby") state.game = null;
  state.error = null;
  render();
});

socket.on("game:state", (game) => {
  const keepPrivateAction = state.game?.phase === game.phase
    && state.privateAction?.playerId === game.myPlayerId
    && !game.submitted;
  state.game = game;
  if (!keepPrivateAction) {
    state.privateAction = null;
    state.observation = null;
  }
  state.error = null;
  render();
});

socket.on("game:private", (action) => {
  state.privateAction = action;
  state.observation = null;
  render();
});

socket.on("game:observation", (observation) => {
  state.observation = observation;
  render();
});

socket.on("room:error", ({ message }) => {
  state.error = message;
  render();
});

render();
