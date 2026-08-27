import { atom, binary, explainFormula, formatFormula, not, ROLE_META } from "./logic.js";
import { TruthOrWolfGame } from "./game.js";

const app = document.querySelector("#app");

const state = {
  game: null,
  logs: [],
  template: "atom",
  leftRole: "wolf",
  leftPlayer: "p1",
  rightRole: "wolf",
  rightPlayer: "p2",
  selectedTarget: null,
  voteResult: null,
  nightResult: null,
  ending: null,
  logicFailure: null,
};

const roleDescriptions = {
  wolf: "夜ごとに一人を襲撃する。論理を武器に、正体を隠せ。",
  seer: "夜ごとに一人を占い、人狼か否かだけを知る。初日は必ず白判定。",
  guardian: "夜ごとに一人を護衛し、襲撃から守る。",
  citizen: "能力はない。命題と推論だけがあなたの武器。",
};

const symbols = { atom: "P", not: "¬P", and: "P ∧ Q", or: "P ∨ Q", implies: "P → Q", iff: "P ↔ Q" };

function currentFormula() {
  const left = atom(state.leftRole, state.leftPlayer);
  if (state.template === "atom") return left;
  if (state.template === "not") return not(left);
  const right = atom(state.rightRole, state.rightPlayer);
  return binary(state.template, left, right);
}

function roleOptions(selected) {
  return Object.entries(ROLE_META).map(([value, meta]) =>
    `<option value="${value}" ${value === selected ? "selected" : ""}>${meta.symbol}：${meta.predicateLabel ?? meta.label}</option>`).join("");
}

function playerOptions(selected, aliveOnly = false) {
  return state.game.players
    .filter((player) => !aliveOnly || player.alive)
    .map((player) => `<option value="${player.id}" ${player.id === selected ? "selected" : ""}>${player.name}</option>`)
    .join("");
}

function header() {
  const game = state.game;
  return `
    <header class="topbar">
      <div class="brand"><div class="brand-mark"><span>∴</span></div><div><div class="brand-name">TRUTH OR WOLF</div><div class="brand-sub">論理人狼</div></div></div>
      ${game ? `<div class="status-line"><span class="status-dot"></span><span><b>DAY ${game.day}</b></span><span class="hide-mobile">生存 ${game.alivePlayers().length} / 7</span><span class="hide-mobile">発言 ${game.statementsToday} / 3</span></div>` : `<div class="status-line"><a class="microcopy" href="./">← 関数版</a><span class="status-dot"></span><span>7 PLAYERS · SOLO</span></div>`}
    </header>`;
}

function landing() {
  return `<div class="shell">${header()}
    <main class="hero">
      <section>
        <div class="eyebrow">A game of deduction & deception</div>
        <h1>真実か、<br><em>人狼か。</em></h1>
        <p class="hero-copy">言葉は使えない。使えるのは命題と演算子だけ。六人の推論者を欺き、人狼を見抜け。ただし、あなたの論理が一度でも破綻すれば——その場で追放される。</p>
        <div class="hero-actions"><button class="primary-button" id="start-game">議論を開始する</button><span class="microcopy">所要時間 約10分 · 1人用</span></div>
      </section>
      <aside>
        <div class="axiom-card">
          <div class="axiom-index">AXIOM / 01</div>
          <div class="axiom-formula">(P → Q) ∧ P ∧ ¬Q<br><span class="false">= ⊥</span></div>
          <div class="axiom-rule">推論上の矛盾を検出した瞬間、投票を待たずあなたは追放される。支持率・占い結果・役職は判定に影響しない。</div>
          <div class="feature-list">
            <div class="feature"><b>7人村</b>あなた + 確率で動くCPU 6人</div>
            <div class="feature"><b>4つの役職</b>人狼・占い師・狩人・市民</div>
            <div class="feature"><b>完全選択式</b>タイピング不要の論理式</div>
            <div class="feature"><b>論理 × Bayes</b>SAT判定と個別事後確率</div>
          </div>
        </div>
      </aside>
    </main>
  </div>`;
}

function playerCard(player) {
  const game = state.game;
  const visibleRole = player.id === game.human.id || player.revealed ? ROLE_META[player.role].label : player.alive ? "役職不明" : "夜に死亡・不明";
  const suspicion = Math.round(game.getAverageSuspicion(player.id) * 100);
  return `<div class="player-card ${player.alive ? "" : "dead"}">
    <div class="avatar">${player.name.slice(0, 1)}</div>
    <div><div class="player-name">${player.name}</div><div class="player-role">${player.alive ? visibleRole : `† ${visibleRole}`}</div></div>
    <div class="suspicion ${suspicion >= 45 ? "high" : ""}"><strong>${suspicion}%</strong><span>平均疑惑</span></div>
  </div>`;
}

function leftColumn() {
  const game = state.game;
  const role = ROLE_META[game.human.role];
  const initial = game.getHumanInitialDivination();
  const initialTarget = initial ? game.players.find((player) => player.id === initial.targetId) : null;
  return `<aside class="left-column">
    <section class="panel"><div class="panel-head"><div class="panel-kicker">Participants</div><div class="panel-title">参加者</div></div><div class="roster">${game.players.map(playerCard).join("")}</div></section>
    <section class="panel role-card"><div class="panel-kicker">Your role</div><div class="role-name">${role.label}</div><div class="role-desc">${roleDescriptions[game.human.role]}</div>${initialTarget ? `<div class="private-info">初日占い：C(${initialTarget.name}) · 市民陣営</div>` : ""}<div class="role-glyph">${role.symbol}</div></section>
  </aside>`;
}

function message(entry) {
  if (entry.type === "system") return `<div class="message system">— ${entry.text} —</div>`;
  const formula = formatFormula(entry.formula, state.game.players);
  return `<div class="message ${entry.type === "human" ? "human" : ""}">
    <div class="message-avatar">${entry.speaker.name.slice(0, 1)}</div>
    <div><div class="message-meta">${entry.speaker.name} · 命題 ${String(entry.index ?? 1).padStart(2, "0")}</div><div class="formula">${formula}</div><div class="message-gloss">${explainFormula(entry.formula, state.game.players)}</div></div>
  </div>`;
}

function atomBlock(side, role, player) {
  return `<div class="atom-block"><label>${side === "left" ? "命題 P" : "命題 Q"}</label><div class="atom-fields">
    <select data-field="${side}Role" aria-label="${side} role">${roleOptions(role)}</select>
    <select data-field="${side}Player" aria-label="${side} player">${playerOptions(player)}</select>
  </div></div>`;
}

function composer() {
  const game = state.game;
  const formula = currentFormula();
  const binaryTemplate = !["atom", "not"].includes(state.template);
  return `<div class="composer">
    <div class="composer-top"><span class="composer-label">論理式ビルダー</span><span class="consistency">現在の発言集合は充足可能</span></div>
    <div class="templates">${Object.entries(symbols).map(([key, label]) => `<button class="template-button ${state.template === key ? "active" : ""}" data-template="${key}">${label}</button>`).join("")}</div>
    <div class="atom-builders ${binaryTemplate ? "" : "single"}">
      ${atomBlock("left", state.leftRole, state.leftPlayer)}
      ${binaryTemplate ? `<div class="operator">${symbols[state.template].replace("P", "").replace("Q", "").trim()}</div>${atomBlock("right", state.rightRole, state.rightPlayer)}` : ""}
    </div>
    <div class="preview"><div class="preview-formula">${formatFormula(formula, game.players)}</div><div class="preview-gloss">${explainFormula(formula, game.players)}</div></div>
    <div class="composer-actions"><button class="primary-button" id="speak" ${game.statementsToday >= 3 ? "disabled" : ""}>この命題を発言する</button><button class="secondary-button" id="go-vote">投票へ進む</button></div>
  </div>`;
}

function voteStage() {
  const game = state.game;
  return `<div class="stage"><div class="stage-symbol">∵</div><h2>追放投票</h2><p>CPUは各自の疑惑度が最大の人物へ投票します。同率の場合のみ無作為に選択されます。</p>
    <div class="target-grid">${game.alivePlayers().filter((p) => p.id !== game.human.id).map((player) => `<button class="target-button ${state.selectedTarget === player.id ? "selected" : ""}" data-target="${player.id}">${player.name}<br><small>疑惑 ${Math.round(game.getAverageSuspicion(player.id) * 100)}%</small></button>`).join("")}</div>
    <button class="primary-button" id="cast-vote" ${state.selectedTarget ? "" : "disabled"}>投票を確定する</button>
    <button class="secondary-button" id="back-discussion">議論に戻る</button>
  </div>`;
}

function voteResultStage() {
  const result = state.voteResult;
  return `<div class="stage"><div class="stage-symbol">†</div><h2>${result.exile.name}を追放</h2><p>最多票を得た${result.exile.name}の役職は「${ROLE_META[result.exile.role].label}」でした。</p>
    <div class="vote-list">${result.votes.map((vote) => `<div class="vote-row"><span>${vote.voter.name}</span><b>→</b><span>${vote.target.name}</span></div>`).join("")}</div>
    ${result.outcome.over ? "" : `<button class="primary-button" id="go-night">夜を迎える</button>`}
  </div>`;
}

function nightStage() {
  const game = state.game;
  const action = game.getNightAction();
  const needsTarget = action.type !== "sleep";
  const candidates = game.getNightCandidates(action.type);
  const icon = action.type === "attack" ? "☾" : action.type === "divine" ? "◉" : action.type === "protect" ? "◇" : "⋯";
  return `<div class="stage"><div class="stage-symbol">${icon}</div><h2>第${game.day}夜 · ${action.label}</h2><p>夜の行動は他の参加者には公開されません。占いで判明するのは人狼か否かだけです。</p>
    ${needsTarget ? `<div class="target-grid">${candidates.map((player) => `<button class="target-button ${state.selectedTarget === player.id ? "selected" : ""}" data-target="${player.id}">${player.name}</button>`).join("")}</div>` : ""}
    <button class="primary-button" id="resolve-night" ${needsTarget && !state.selectedTarget ? "disabled" : ""}>${needsTarget ? "行動を確定する" : "夜を明かす"}</button>
  </div>`;
}

function nightResultStage() {
  const result = state.nightResult;
  let text = result.killed ? `${result.killed.name}が襲撃され、姿を消しました。` : "昨夜の襲撃は失敗しました。村は静かな朝を迎えます。";
  if (result.divineResult) {
    const target = state.game.players.find((p) => p.id === result.divineResult.targetId);
    text += ` 占いの結果、${target.name}は${result.divineResult.isWolf ? "人狼" : "市民陣営"}と判明しました。`;
  }
  return `<div class="stage"><div class="stage-symbol">☼</div><h2>夜明け</h2><p>${text}</p>${result.outcome.over ? "" : `<button class="primary-button" id="next-day">第${state.game.day + 1}日の議論へ</button>`}</div>`;
}

function discussionContent() {
  const game = state.game;
  if (game.phase === "vote") return voteStage();
  if (game.phase === "vote-result") return voteResultStage();
  if (game.phase === "night") return nightStage();
  if (game.phase === "night-result") return nightResultStage();
  return `<div class="log" id="discussion-log">${state.logs.map(message).join("")}</div>${composer()}`;
}

function centerColumn() {
  const game = state.game;
  const phaseNames = { discussion: "議論中", vote: "投票", "vote-result": "投票結果", night: "夜", "night-result": "夜明け" };
  return `<main class="panel discussion-panel"><div class="panel-head discussion-head"><div><div class="panel-kicker">Public discussion</div><div class="panel-title">第${game.day}日目の議論</div></div><div class="phase-badge">${phaseNames[game.phase] ?? "論理破綻"}</div></div>${discussionContent()}</main>`;
}

function rightColumn() {
  const game = state.game;
  return `<aside class="right-column">
    <section class="panel"><div class="panel-head"><div class="panel-kicker">Your propositions</div><div class="panel-title">発言台帳</div></div><div class="notebook">
      ${game.playerHistory.length ? game.playerHistory.map((formula, i) => `<div class="history-item"><div class="history-index">STATEMENT ${String(i + 1).padStart(2, "0")}</div><div class="history-formula">${formatFormula(formula, game.players)}</div></div>`).join("") : `<div class="empty-state">まだ命題を発言していません。<br>発言はすべてここに記録されます。</div>`}
    </div></section>
    <section class="panel axioms"><div class="panel-kicker">Village axioms</div><div class="axiom-row"><span>各人の役職</span><code>exactly 1</code></div><div class="axiom-row"><span>人狼</span><code>ΣW = 1</code></div><div class="axiom-row"><span>占い師</span><code>ΣS = 1</code></div><div class="axiom-row"><span>狩人</span><code>ΣG = 1</code></div><div class="axiom-row"><span>CPU信念</span><code>Pᵢ(role | evidence)</code></div></section>
  </aside>`;
}

function endingModal() {
  if (state.logicFailure) {
    const conflict = state.logicFailure.conflictIndexes.map((index) => state.game.playerHistory[index]);
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-icon">⊥</div><div class="eyebrow">Logical contradiction detected</div><h2>論理が破綻した</h2><p>新しい命題を加えると、これまでの発言と村の公理を同時に真にできません。議論は直ちに終了し、あなたは追放されます。</p>
      <div class="conflict-box">${conflict.map((formula) => `<div>${formatFormula(formula, state.game.players)}</div>`).join("")}<div>${formatFormula(state.logicFailure.candidate, state.game.players)}</div><div class="therefore">∴ contradiction (⊥)</div></div>
      <button class="primary-button" id="restart">もう一度プレイ</button></div></div>`;
  }
  if (!state.ending) return "";
  return `<div class="modal-backdrop"><div class="modal"><div class="modal-icon">${state.ending.won ? "∴" : "†"}</div><div class="eyebrow">Game concluded</div><h2>${state.ending.won ? "あなたの勝利" : "あなたの敗北"}</h2><p>${state.ending.reason}<br>あなたの役職は「${ROLE_META[state.game.human.role].label}」でした。</p><button class="primary-button" id="restart">もう一度プレイ</button></div></div>`;
}

function gameScreen() {
  return `<div class="shell">${header()}<div class="game-layout">${leftColumn()}${centerColumn()}${rightColumn()}</div>${endingModal()}</div>`;
}

function render() {
  app.innerHTML = state.game ? gameScreen() : landing();
  bindEvents();
  requestAnimationFrame(() => {
    const log = document.querySelector("#discussion-log");
    if (log) log.scrollTop = log.scrollHeight;
  });
}

function addCpuDiscussion() {
  const messages = state.game.runCpuDiscussion();
  for (const item of messages) state.logs.push({ type: "cpu", ...item, index: state.logs.length + 1 });
}

function startGame() {
  Object.assign(state, {
    game: new TruthOrWolfGame(), logs: [], selectedTarget: null, voteResult: null,
    nightResult: null, ending: null, logicFailure: null, template: "atom",
    leftRole: "wolf", leftPlayer: "p1", rightRole: "wolf", rightPlayer: "p2",
  });
  state.logs.push({ type: "system", text: "配役が完了しました。第1日の議論を開始します" });
  const initial = state.game.getHumanInitialDivination();
  if (initial) {
    const target = state.game.players.find((player) => player.id === initial.targetId);
    state.logs.push({ type: "system", text: `初日占い（非公開）：C(${target.name}) — 市民陣営です` });
  }
  addCpuDiscussion();
  render();
}

function bindEvents() {
  document.querySelector("#start-game")?.addEventListener("click", startGame);
  document.querySelector("#restart")?.addEventListener("click", startGame);
  document.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => {
    state.template = button.dataset.template; render();
  }));
  document.querySelectorAll("[data-field]").forEach((select) => select.addEventListener("change", () => {
    state[select.dataset.field] = select.value; render();
  }));
  document.querySelector("#speak")?.addEventListener("click", () => {
    const formula = currentFormula();
    const verdict = state.game.makePlayerStatement(formula);
    if (!verdict.consistent) {
      state.logicFailure = { ...verdict, candidate: formula };
    } else {
      state.logs.push({ type: "human", speaker: state.game.human, formula, index: state.game.playerHistory.length });
      state.logs.push({ type: "system", text: "矛盾なし — CPUの事後確率が更新されました" });
    }
    render();
  });
  document.querySelector("#go-vote")?.addEventListener("click", () => {
    state.game.phase = "vote"; state.selectedTarget = null; render();
  });
  document.querySelector("#back-discussion")?.addEventListener("click", () => {
    state.game.phase = "discussion"; state.selectedTarget = null; render();
  });
  document.querySelectorAll("[data-target]").forEach((button) => button.addEventListener("click", () => {
    state.selectedTarget = button.dataset.target; render();
  }));
  document.querySelector("#cast-vote")?.addEventListener("click", () => {
    state.voteResult = state.game.vote(state.selectedTarget); state.selectedTarget = null;
    if (state.voteResult.outcome.over) state.ending = state.voteResult.outcome;
    render();
  });
  document.querySelector("#go-night")?.addEventListener("click", () => {
    state.game.phase = "night"; state.selectedTarget = null; render();
  });
  document.querySelector("#resolve-night")?.addEventListener("click", () => {
    state.nightResult = state.game.resolveNight(state.selectedTarget); state.selectedTarget = null;
    if (state.nightResult.outcome.over) state.ending = state.nightResult.outcome;
    render();
  });
  document.querySelector("#next-day")?.addEventListener("click", () => {
    const result = state.nightResult;
    state.game.startNextDay();
    state.logs = [{ type: "system", text: result.killed ? `${result.killed.name}が夜に姿を消しました` : "昨夜の犠牲者はいません" }];
    state.nightResult = null; state.voteResult = null;
    addCpuDiscussion(); render();
  });
}

render();
