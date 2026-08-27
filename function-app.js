import { FunctionWolfGame, MODULUS } from "./function-game.js";

const app = document.querySelector("#app");

const state = {
  game: null,
  humanCount: 1,
  view: "setup",
  queue: [],
  queueIndex: 0,
  activePlayerId: null,
  observation: null,
  humanVotes: new Map(),
  voteResult: null,
};

function header() {
  return `<header class="topbar">
    <div class="brand"><div class="brand-mark"><span>∘</span></div><div><div class="brand-name">TRUTH OR WOLF</div><div class="brand-sub">FUNCTION PROTOCOL</div></div></div>
    ${state.game ? `<div class="status-line"><span class="status-dot"></span><b>ROUND ${state.game.round}</b><span class="hide-mobile">生存 ${state.game.alivePlayers().length} / 7</span><span class="hide-mobile">LOCAL ${state.game.players.filter((p) => p.human).length}P</span></div>` : `<a class="mode-link" href="./classic.html">クラシック論理版 →</a>`}
  </header>`;
}

function setupScreen() {
  return `<div class="shell">${header()}<main class="hero function-hero">
    <section>
      <div class="eyebrow">Function composition × hidden infection</div>
      <h1>関数は、<br><em>感染する。</em></h1>
      <p class="hero-copy">知っているのは自分の関数と、人狼が持つ関数 W だけ。自分と指名相手の関数を合成して得た曖昧な結果を持ち寄り、Wの持ち主を探せ。</p>
      <div class="player-count"><label>この端末で遊ぶ人数（残りはCPU）</label><div class="count-buttons">${Array.from({ length: 7 }, (_, index) => `<button class="count-button ${state.humanCount === index + 1 ? "active" : ""}" data-count="${index + 1}">${index + 1}</button>`).join("")}</div></div>
      <div class="hero-actions"><button class="primary-button" id="start-function-game">関数を配布する</button><span class="microcopy">1〜7人 · 同一端末パス＆プレイ</span></div>
    </section>
    <aside><div class="axiom-card"><div class="axiom-index">PROTOCOL / W</div><div class="formula-stack"><div class="main-equation">Tᵢ(j) = Obsᵢ(Fᵢ ∘ Fⱼ)</div><div class="sub-equation">Fwolf = W</div></div><div class="axiom-rule">Wの定義は公開されているが、各個人の関数は本人だけが知る。一人の検査には必ず偽陽性候補が含まれ、複数人の結果を合わせて初めて絞り込める。</div><div class="feature-list"><div class="feature"><b>秘密関数</b>自分の関数だけを確認可能</div><div class="feature"><b>合成検査</b>Fᵢ ∘ Fⱼ を個別条件で観測</div><div class="feature"><b>複数関数</b>一次・二次・三次・表関数</div><div class="feature"><b>調整済み衝突</b>全検査に2〜4人の候補</div></div></div></aside>
  </main></div>`;
}

function functionPlayer(player) {
  return `<div class="function-player ${player.alive ? "" : "dead"}"><div class="function-player-top"><span class="function-player-name">${player.alive ? "" : "† "}${player.name}</span>${player.human ? `<span class="human-badge">PLAYER</span>` : ""}</div><div class="function-expression">F${player.id.slice(1)}(x) = ?</div><div class="function-family">本人だけが知る秘密関数</div></div>`;
}

function leftPanel() {
  return `<aside class="function-left"><section class="panel omega-card"><div class="panel-kicker">Known wolf function</div><div class="panel-title">人狼関数 W</div><div class="omega-expression">${state.game.omega.label}</div><div class="omega-note">この定義だけは全員の共通知識です。元の人狼は、この関数そのものを個人関数として持っています。</div><div class="omega-symbol">W</div></section><section class="panel"><div class="panel-head"><div class="panel-kicker">Private functions</div><div class="panel-title">参加者</div></div><div class="function-roster">${state.game.players.map(functionPlayer).join("")}</div></section></aside>`;
}

function reportsMarkup() {
  const reports = state.game.publicReports;
  if (!reports.length) return `<div class="report-empty">公開された観測結果はまだありません。</div>`;
  return `<div class="reports">${[...reports].reverse().map((report) => `<div class="report"><div class="report-head"><span>ROUND ${report.round} · ${report.observer.name} → ${report.target.name}</span><span>REPORT</span></div><div class="report-formula">T<sub>${report.observer.name}</sub>(${report.target.name}) = ${report.matchesWolf ? "⊤" : "⊥"}</div><div class="message-gloss">「私の合成検査では、人狼関数Wの結果と${report.matchesWolf ? "一致した" : "一致しなかった"}」</div></div>`).join("")}</div>`;
}

function publicDiscussion() {
  return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>公開観測</h2><p>各人の秘密関数は公開されません。一致報告が一つだけでは、調整された偽陽性候補と区別できません。</p></div>${reportsMarkup()}<div class="action-buttons"><button class="primary-button" id="start-vote">追放投票へ</button></div>`;
}

function investigationAction() {
  const game = state.game;
  const actor = game.players.find((player) => player.id === state.activePlayerId);
  const ownTable = game.privateFunctionTable(actor).join(" ");
  const expectedValue = actor.baseFunction.evaluate(game.omega.evaluate(actor.condition.input));
  const expected = actor.condition.observe(expectedValue);
  const history = game.investigationHistory.get(actor.id);
  const historyMarkup = history.length ? `<div class="private-history"><div class="condition-label">YOUR PAST RESULTS</div>${history.map((report) => `<div><span>${report.target.name}</span><b>${report.matchesWolf ? "⊤" : "⊥"}</b><small>${report.observed.display}</small></div>`).join("")}</div>` : "";
  return `<div class="action-card"><span class="private-role">${actor.role === "wolf" ? "元の人狼" : "市民"}</span><h3>${actor.name}の秘密観測</h3><p>自分の関数を外側、指名相手の関数を内側として F<sub>self</sub> ∘ F<sub>target</sub> を観測します。</p><div class="condition-box"><div class="condition-label">YOUR PRIVATE FUNCTION</div><div class="condition-value">${actor.baseFunction.label}</div><div class="function-vector">[ ${ownTable} ]</div></div><div class="condition-box"><div class="condition-label">YOUR TEST</div><div class="condition-value">${actor.condition.label}<br>Wなら期待結果：${expected.display}</div></div>${historyMarkup}<div class="target-grid function-targets">${game.alivePlayers().filter((player) => player.id !== actor.id).map((player) => `<button class="target-button" data-investigate="${player.id}">${player.name}<span class="function-mini">F${player.id.slice(1)}(x) = ?</span></button>`).join("")}</div></div>`;
}

function observationResult() {
  const report = state.observation;
  return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${report.target.name}の合成検査</h3><p>結果そのものは自分だけが確認します。公開時は、人狼関数Wの期待結果と一致したかだけを伝えます。</p><div class="condition-box"><div class="condition-label">Fself ∘ Ftarget</div><div class="condition-value">${report.condition.label}</div></div><div class="result-value">観測：${report.observed.display}<br><small>Wの期待：${report.expectedWolf.display}</small></div><div class="condition-box"><div class="condition-label">WOLF HYPOTHESIS</div><div class="condition-value">T(${report.target.name}) = ${report.matchesWolf ? "⊤ · 一致" : "⊥ · 不一致"}</div></div><div class="action-buttons"><button class="primary-button" data-publish="yes">一致判定を公開する</button>${report.observer.role === "wolf" ? `<button class="danger-button" data-publish="lie">逆の判定を公開</button>` : ""}<button class="secondary-button" data-publish="no">結果を伏せる</button></div></div>`;
}

function voteAction() {
  const game = state.game;
  const actor = game.players.find((player) => player.id === state.activePlayerId);
  return `<div class="action-card"><span class="private-role">${actor.role === "wolf" ? "元の人狼" : "市民"}</span><h3>${actor.name}の投票</h3><p>一人を追放するか、「追放しない」を選びます。投票結果は集計だけが公開されます。</p><div class="target-grid function-targets">${game.alivePlayers().filter((player) => player.id !== actor.id).map((player) => `<button class="target-button" data-vote="${player.id}">${player.name}</button>`).join("")}<button class="target-button" data-vote="none">∅ 追放しない</button></div></div>`;
}

function tallyMarkup(result) {
  const game = state.game;
  const total = game.alivePlayers().length + (result.exiled ? 1 : 0);
  return `<div class="tally">${[...result.tally.entries()].sort((a,b) => b[1]-a[1]).map(([choice, count]) => {
    const label = choice === "none" ? "追放しない" : game.players.find((player) => player.id === choice)?.name;
    return `<div class="tally-row"><span>${label}</span><div class="tally-bar"><div class="tally-fill" style="width:${count / total * 100}%"></div></div><b>${count}</b></div>`;
  }).join("")}</div>`;
}

function voteResultView() {
  const result = state.voteResult;
  const text = result.exiled ? `${result.exiled.name}が追放されました。${result.exiled.role === "wolf" ? "元の人狼でした。" : "元の人狼ではありませんでした。"}` : "この日は誰も追放されませんでした。";
  return `<div class="action-card"><span class="private-role">VOTE RESULT</span><h3>投票結果</h3><p>${text}</p>${tallyMarkup(result)}${state.game.outcome ? "" : `<div class="action-buttons"><button class="primary-button" id="go-night">夜へ進む</button></div>`}</div>`;
}

function nightAction() {
  const game = state.game;
  const wolf = game.wolf;
  const candidates = game.alivePlayers().filter((player) => player.role !== "wolf" && !player.infected);
  return `<div class="action-card"><span class="private-role">元の人狼</span><h3>合成対象を選ぶ</h3><p>選んだ市民の秘密関数は、本人に知られないまま W ∘ F へ変化します。</p><div class="target-grid function-targets">${candidates.map((player) => `<button class="target-button" data-attack="${player.id}">${player.name}<span class="function-mini">秘密関数</span></button>`).join("")}</div><div class="condition-box"><div class="condition-label">CURRENT WOLF SIDE</div><div class="condition-value">${[wolf, ...game.players.filter((p) => p.infected && p.alive)].map((p) => p.name).join(" · ")}</div></div></div>`;
}

function nightResultView() {
  return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3><p>生存者一人の関数に W が秘密裏に合成されました。対象者自身も、その変化を知りません。</p><div class="result-value">Fᵢ′ = W ∘ Fᵢ</div>${state.game.outcome ? "" : `<div class="action-buttons"><button class="primary-button" id="next-round">ROUND ${state.game.round + 1}へ</button></div>`}</div>`;
}

function mainContent() {
  if (state.view === "investigate") return investigationAction();
  if (state.view === "observation") return observationResult();
  if (state.view === "discussion") return publicDiscussion();
  if (state.view === "vote") return voteAction();
  if (state.view === "vote-result") return voteResultView();
  if (state.view === "night") return nightAction();
  if (state.view === "night-result") return nightResultView();
  return "";
}

function rightPanel() {
  return `<aside class="function-right"><section class="panel"><div class="panel-head"><div class="panel-kicker">Protocol</div><div class="panel-title">勝敗規則</div></div><div class="rule-list"><div class="rule-item"><div class="rule-number">01</div><div class="rule-text">Wを個人関数として持つ元人狼を追放すれば市民側の勝利。</div></div><div class="rule-item"><div class="rule-number">02</div><div class="rule-text">調査は Fself ∘ Ftarget を秘密条件で評価する。</div></div><div class="rule-item"><div class="rule-number">03</div><div class="rule-text">襲撃済み市民の投票は元人狼の投票先へ自動置換。</div></div><div class="rule-item"><div class="rule-number">04</div><div class="rule-text">元人狼＋襲撃済み市民が生存者の過半数を超えると人狼側勝利。</div></div></div></section><section class="panel secret-meter"><div class="panel-kicker">Infection status</div><b>UNKNOWN</b></section></aside>`;
}

function outcomeModal() {
  const outcome = state.game.outcome;
  if (!outcome) return "";
  return `<div class="modal-backdrop"><div class="modal"><div class="modal-icon">${outcome.winner === "citizen" ? "∴" : "W"}</div><div class="eyebrow">Protocol concluded</div><h2>${outcome.winner === "citizen" ? "市民側の勝利" : "人狼側の勝利"}</h2><p>${outcome.reason}</p><div class="outcome-reveal">${state.game.players.map((player) => `<div class="outcome-person"><b>${player.name}</b><span>${player.role === "wolf" ? "元の人狼" : player.infected ? "襲撃済み市民" : "市民"}<br>${player.baseFunction.label}</span></div>`).join("")}</div><button class="primary-button" id="restart-function">もう一度プレイ</button></div></div>`;
}

function board() {
  return `<div class="shell">${header()}<div class="function-board">${leftPanel()}<main class="panel function-main"><div class="panel-head discussion-head"><div><div class="panel-kicker">Function village</div><div class="panel-title">ROUND ${state.game.round}</div></div><div class="phase-badge">${state.view.toUpperCase()}</div></div><div class="function-main-body">${mainContent()}</div></main>${rightPanel()}</div>${outcomeModal()}</div>`;
}

function passScreen(kind) {
  const player = state.game.players.find((candidate) => candidate.id === state.activePlayerId);
  const labels = kind === "night"
    ? { icon: "W", title: `${player.name}へ端末を渡してください`, body: "元の人狼だけが見る夜の操作です。ほかの人は画面から目を離してください。", button: "人狼として夜を始める" }
    : { icon: kind === "vote" ? "∵" : "◉", title: `${player.name}へ端末を渡してください`, body: `${kind === "vote" ? "投票" : "観測条件と結果"}は個人情報です。本人以外は画面から目を離してください。`, button: kind === "vote" ? "自分の投票を始める" : "自分の観測を始める" };
  return `<div class="shell">${header()}<main class="pass-screen"><div class="pass-card"><div class="pass-icon">${labels.icon}</div><h2>${labels.title}</h2><p>${labels.body}</p><div class="privacy-warning">周囲に画面が見えないことを確認してください</div><button class="primary-button" id="reveal-private" data-kind="${kind}">${labels.button}</button></div></main></div>`;
}

function render() {
  if (!state.game) app.innerHTML = setupScreen();
  else if (state.view === "pass-investigation") app.innerHTML = passScreen("investigation");
  else if (state.view === "pass-vote") app.innerHTML = passScreen("vote");
  else if (state.view === "pass-night") app.innerHTML = passScreen("night");
  else app.innerHTML = board();
  bindEvents();
}

function startInvestigationQueue() {
  state.queue = state.game.getHumanActors().map((player) => player.id);
  state.queueIndex = 0;
  state.activePlayerId = state.queue[0] ?? null;
  if (state.queue.length) state.view = "pass-investigation";
  else {
    state.game.runCpuInvestigations();
    state.view = "discussion";
  }
}

function advanceInvestigation() {
  state.queueIndex += 1;
  state.observation = null;
  if (state.queueIndex < state.queue.length) {
    state.activePlayerId = state.queue[state.queueIndex];
    state.view = "pass-investigation";
  } else {
    state.game.runCpuInvestigations();
    state.activePlayerId = null;
    state.view = "discussion";
  }
}

function startVoteQueue() {
  state.queue = state.game.getHumanActors().map((player) => player.id);
  state.queueIndex = 0;
  state.humanVotes = new Map();
  state.activePlayerId = state.queue[0] ?? null;
  if (state.queue.length) state.view = "pass-vote";
  else {
    state.voteResult = state.game.resolveVotes(state.humanVotes);
    state.view = "vote-result";
  }
}

function advanceVote(choice) {
  state.humanVotes.set(state.activePlayerId, choice);
  state.queueIndex += 1;
  if (state.queueIndex < state.queue.length) {
    state.activePlayerId = state.queue[state.queueIndex];
    state.view = "pass-vote";
  } else {
    state.voteResult = state.game.resolveVotes(state.humanVotes);
    state.activePlayerId = null;
    state.view = "vote-result";
  }
}

function beginNight() {
  const wolf = state.game.wolf;
  if (wolf.human && wolf.alive) {
    state.activePlayerId = wolf.id;
    state.view = "pass-night";
  } else {
    state.game.resolveNight();
    state.view = "night-result";
  }
}

function bindEvents() {
  document.querySelectorAll("[data-count]").forEach((button) => button.addEventListener("click", () => {
    state.humanCount = Number(button.dataset.count); render();
  }));
  document.querySelector("#start-function-game")?.addEventListener("click", () => {
    state.game = new FunctionWolfGame({ humanCount: state.humanCount });
    state.voteResult = null;
    startInvestigationQueue(); render();
  });
  document.querySelector("#restart-function")?.addEventListener("click", () => {
    state.game = null; state.view = "setup"; render();
  });
  document.querySelector("#reveal-private")?.addEventListener("click", (event) => {
    const kind = event.currentTarget.dataset.kind;
    state.view = kind === "vote" ? "vote" : kind === "night" ? "night" : "investigate";
    render();
  });
  document.querySelectorAll("[data-investigate]").forEach((button) => button.addEventListener("click", () => {
    state.observation = state.game.investigate(state.activePlayerId, button.dataset.investigate);
    state.view = "observation"; render();
  }));
  document.querySelectorAll("[data-publish]").forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.publish;
    if (mode === "lie") {
      state.game.publishReport({ ...state.observation, matchesWolf: !state.observation.matchesWolf, truthful: false }, true);
    } else {
      state.game.publishReport(state.observation, mode === "yes");
    }
    advanceInvestigation(); render();
  }));
  document.querySelector("#start-vote")?.addEventListener("click", () => { startVoteQueue(); render(); });
  document.querySelectorAll("[data-vote]").forEach((button) => button.addEventListener("click", () => {
    advanceVote(button.dataset.vote); render();
  }));
  document.querySelector("#go-night")?.addEventListener("click", () => { beginNight(); render(); });
  document.querySelectorAll("[data-attack]").forEach((button) => button.addEventListener("click", () => {
    state.game.resolveNight(button.dataset.attack); state.activePlayerId = null; state.view = "night-result"; render();
  }));
  document.querySelector("#next-round")?.addEventListener("click", () => {
    state.game.startNextRound(); state.voteResult = null; startInvestigationQueue(); render();
  });
}

render();
