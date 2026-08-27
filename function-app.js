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
      <p class="hero-copy">全員の関数と人狼関数 Ω は公開されている。しかし観測値は衝突する。秘密裏に合成された関数を追い、元の人狼だけを追放せよ。</p>
      <div class="player-count"><label>この端末で遊ぶ人数（残りはCPU）</label><div class="count-buttons">${Array.from({ length: 7 }, (_, index) => `<button class="count-button ${state.humanCount === index + 1 ? "active" : ""}" data-count="${index + 1}">${index + 1}</button>`).join("")}</div></div>
      <div class="hero-actions"><button class="primary-button" id="start-function-game">関数を配布する</button><span class="microcopy">1〜7人 · 同一端末パス＆プレイ</span></div>
    </section>
    <aside><div class="axiom-card"><div class="axiom-index">PROTOCOL / Ω</div><div class="formula-stack"><div class="main-equation">Fᵢ′ = Ω ∘ Fᵢ</div><div class="sub-equation">|infected ∪ {wolf}| &gt; |alive| / 2</div></div><div class="axiom-rule">襲撃された市民は生存し、自分が変化したことに気づかない。ただし投票だけは元の人狼と同じ対象へ秘密裏に置換される。</div><div class="feature-list"><div class="feature"><b>公開関数</b>一次・二次・三次・表関数</div><div class="feature"><b>秘密の合成</b>Ω ∘ Fᵢ は本人にも非公開</div><div class="feature"><b>個別観測</b>値・偶奇・閾値・集合条件</div><div class="feature"><b>衝突保証</b>一回の結果だけでは断定不能</div></div></div></aside>
  </main></div>`;
}

function functionPlayer(player) {
  const table = state.game.publicFunctionTable(player).join(" ");
  return `<div class="function-player ${player.alive ? "" : "dead"}"><div class="function-player-top"><span class="function-player-name">${player.alive ? "" : "† "}${player.name}</span>${player.human ? `<span class="human-badge">PLAYER</span>` : ""}</div><div class="function-expression">${player.baseFunction.label}</div><div class="function-family">${player.baseFunction.family} · 公開値 x=0…6</div><div class="function-vector">[ ${table} ]</div></div>`;
}

function leftPanel() {
  return `<aside class="function-left"><section class="panel omega-card"><div class="panel-kicker">Public wolf function</div><div class="panel-title">人狼関数</div><div class="omega-expression">${state.game.omega.label}</div><div class="omega-note">この関数自体は全員が知っています。襲撃または元人狼の場合のみ、個人関数の外側へ秘密裏に合成されます。</div><div class="omega-symbol">Ω</div></section><section class="panel"><div class="panel-head"><div class="panel-kicker">Public functions</div><div class="panel-title">配布関数</div></div><div class="function-roster">${state.game.players.map(functionPlayer).join("")}</div></section></aside>`;
}

function reportsMarkup() {
  const reports = state.game.publicReports;
  if (!reports.length) return `<div class="report-empty">公開された観測結果はまだありません。</div>`;
  return `<div class="reports">${[...reports].reverse().map((report) => `<div class="report"><div class="report-head"><span>ROUND ${report.round} · ${report.observer.name} → ${report.target.name}</span><span>${report.truthful ? "REPORT" : "REPORT"}</span></div><div class="report-formula">${report.observed.display}</div></div>`).join("")}</div>`;
}

function publicDiscussion() {
  return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>公開観測</h2><p>公開された条件と結果だけが全員の共通知識です。結果の一致だけでは元人狼を断定できません。</p></div>${reportsMarkup()}<div class="action-buttons"><button class="primary-button" id="start-vote">追放投票へ</button></div>`;
}

function investigationAction() {
  const game = state.game;
  const actor = game.players.find((player) => player.id === state.activePlayerId);
  return `<div class="action-card"><span class="private-role">${actor.role === "wolf" ? "元の人狼" : "市民"}</span><h3>${actor.name}の秘密観測</h3><p>あなたの観測条件で一人の現在関数を調べます。襲撃されていても、市民にはその事実が表示されません。</p><div class="condition-box"><div class="condition-label">YOUR PRIVATE CONDITION</div><div class="condition-value">${actor.condition.label}</div></div><div class="target-grid function-targets">${game.alivePlayers().filter((player) => player.id !== actor.id).map((player) => `<button class="target-button" data-investigate="${player.id}">${player.name}<span class="function-mini">${player.baseFunction.label}</span></button>`).join("")}</div></div>`;
}

function observationResult() {
  const report = state.observation;
  return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${report.target.name}の観測結果</h3><p>この結果を全員へ公開するか、伏せたままにできます。</p><div class="condition-box"><div class="condition-label">CONDITION</div><div class="condition-value">${report.condition.label}</div></div><div class="result-value">${report.observed.display}</div><div class="action-buttons"><button class="primary-button" data-publish="yes">結果を公開する</button><button class="secondary-button" data-publish="no">結果を伏せる</button></div></div>`;
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
  return `<div class="action-card"><span class="private-role">元の人狼</span><h3>合成対象を選ぶ</h3><p>選んだ市民の関数は、本人に知られないまま Ω ∘ F へ変化します。</p><div class="target-grid function-targets">${candidates.map((player) => `<button class="target-button" data-attack="${player.id}">${player.name}<span class="function-mini">${player.baseFunction.label}</span></button>`).join("")}</div><div class="condition-box"><div class="condition-label">CURRENT WOLF SIDE</div><div class="condition-value">${[wolf, ...game.players.filter((p) => p.infected && p.alive)].map((p) => p.name).join(" · ")}</div></div></div>`;
}

function nightResultView() {
  return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3><p>生存者一人の関数に Ω が秘密裏に合成されました。対象者自身も、その変化を知りません。</p><div class="result-value">Fᵢ′ = Ω ∘ Fᵢ</div>${state.game.outcome ? "" : `<div class="action-buttons"><button class="primary-button" id="next-round">ROUND ${state.game.round + 1}へ</button></div>`}</div>`;
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
  return `<aside class="function-right"><section class="panel"><div class="panel-head"><div class="panel-kicker">Protocol</div><div class="panel-title">勝敗規則</div></div><div class="rule-list"><div class="rule-item"><div class="rule-number">01</div><div class="rule-text">元の人狼を追放すれば市民側の勝利。</div></div><div class="rule-item"><div class="rule-number">02</div><div class="rule-text">襲撃者は死亡せず、関数だけが Ω ∘ F に変化する。</div></div><div class="rule-item"><div class="rule-number">03</div><div class="rule-text">襲撃済み市民の投票は元人狼の投票先へ自動置換。</div></div><div class="rule-item"><div class="rule-number">04</div><div class="rule-text">元人狼＋襲撃済み市民が生存者の過半数を超えると人狼側勝利。</div></div></div></section><section class="panel secret-meter"><div class="panel-kicker">Infection status</div><b>UNKNOWN</b></section></aside>`;
}

function outcomeModal() {
  const outcome = state.game.outcome;
  if (!outcome) return "";
  return `<div class="modal-backdrop"><div class="modal"><div class="modal-icon">${outcome.winner === "citizen" ? "∴" : "Ω"}</div><div class="eyebrow">Protocol concluded</div><h2>${outcome.winner === "citizen" ? "市民側の勝利" : "人狼側の勝利"}</h2><p>${outcome.reason}</p><div class="outcome-reveal">${state.game.players.map((player) => `<div class="outcome-person"><b>${player.name}</b><span>${player.role === "wolf" ? "元の人狼" : player.infected ? "襲撃済み市民" : "市民"}</span></div>`).join("")}</div><button class="primary-button" id="restart-function">もう一度プレイ</button></div></div>`;
}

function board() {
  return `<div class="shell">${header()}<div class="function-board">${leftPanel()}<main class="panel function-main"><div class="panel-head discussion-head"><div><div class="panel-kicker">Function village</div><div class="panel-title">ROUND ${state.game.round}</div></div><div class="phase-badge">${state.view.toUpperCase()}</div></div><div class="function-main-body">${mainContent()}</div></main>${rightPanel()}</div>${outcomeModal()}</div>`;
}

function passScreen(kind) {
  const player = state.game.players.find((candidate) => candidate.id === state.activePlayerId);
  const labels = kind === "night"
    ? { icon: "Ω", title: `${player.name}へ端末を渡してください`, body: "元の人狼だけが見る夜の操作です。ほかの人は画面から目を離してください。", button: "人狼として夜を始める" }
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
    state.game.publishReport(state.observation, button.dataset.publish === "yes");
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
