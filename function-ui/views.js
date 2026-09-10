import { escapeHtml, signText, phaseLabel } from "./format.js";

export function createViews({ state }) {
  function header() {
    const game = state.game;
    const room = state.room;
    const status = game
      ? `<div class="status-line"><span class="status-dot"></span><b>ROOM ${escapeHtml(room?.code)}</b><span>ROUND ${game.round}</span><span class="hide-mobile">${phaseLabel(game.phase)} · 生存 ${game.players.filter((player) => player.alive).length}/${game.playerCount ?? game.players.length}</span></div>`
      : room
        ? `<div class="status-line"><span class="status-dot"></span><b>ROOM ${escapeHtml(room.code)}</b><span>${room.status === "lobby" ? "待機中" : "接続中"}</span></div>`
        : `<a class="mode-link" href="./classic.html">クラシック論理版 →</a>`;
    return `<header class="topbar"><div class="brand"><div class="brand-mark"><span>∘</span></div><div><div class="brand-name">TRUTH OR WOLF</div><div class="brand-sub">ONLINE FUNCTION PROTOCOL</div></div></div>${status}</header>`;
  }

  function errorMarkup() { return state.error ? `<div class="room-error">${escapeHtml(state.error)}</div>` : ""; }

  function setupScreen() {
    return `<div class="shell">${header()}<div class="tutorial-select"><button id="start-tutorial-citizen" class="primary-button">市民チュートリアル</button><button id="start-tutorial-wolf" class="secondary-button">人狼チュートリアル</button></div><main class="hero function-hero"><section><div class="eyebrow">Function composition × hidden infection</div><h1>部屋を作り、<br><em>推理する。</em></h1><p class="hero-copy">部屋コードとパスワードを共有して、離れた場所のプレイヤーと関数人狼を遊べます。ゲームの秘密情報はサーバーで管理され、各プレイヤーには自分の情報だけが届きます。</p>${errorMarkup()}<div class="room-forms"><form class="room-form" id="create-room-form"><div class="panel-kicker">CREATE ROOM</div><input name="name" maxlength="24" placeholder="あなたの名前" required><input name="password" type="password" maxlength="64" placeholder="パスワード" required><label class="field-label" for="player-count">参加人数（CPUを含む）</label><input id="player-count" name="playerCount" type="number" min="4" max="12" value="7" required><button class="primary-button" type="submit">部屋を作る</button></form><form class="room-form" id="join-room-form"><div class="panel-kicker">JOIN ROOM</div><input name="name" maxlength="24" placeholder="あなたの名前" required><input name="code" inputmode="numeric" maxlength="6" placeholder="6桁の部屋コード" required><input name="password" type="password" maxlength="64" placeholder="パスワード" required><button class="secondary-button" type="submit">部屋に入る</button></form></div></section><aside><div class="axiom-card"><div class="axiom-index">ONLINE / W</div><div class="formula-stack"><div class="main-equation">Tᵢ(j) = Obsᵢ(Fᵢ ∘ Fⱼ)</div><div class="sub-equation">Fwolf = W</div></div><div class="axiom-rule">1つの部屋に4〜12人。足りない席はCPUが担当します。人狼関数Wは全員に公開されますが、個人関数と秘密条件は本人だけが知ります。</div><div class="feature-list"><div class="feature"><b>ルーム制</b>コードとパスワードで参加</div><div class="feature"><b>人数設定</b>4〜12人から選択</div><div class="feature"><b>同時操作</b>全員が自分の端末から送信</div><div class="feature"><b>CPU補充</b>空席は自動で参加</div></div></div></aside></main></div>`;
  }

  function lobbyScreen() {
    const room = state.room;
    const passwordMarkup = room.isHost && typeof room.password === "string"
      ? `<div class="room-share-list"><div class="room-share-row"><span><small>ROOM CODE</small><b>${escapeHtml(room.code)}</b></span><button class="secondary-button copy-button" data-copy-value="${escapeHtml(room.code)}">コピー</button></div><div class="room-share-row"><span><small>PASSWORD</small><b>${escapeHtml(room.password)}</b></span><button class="secondary-button copy-button" data-copy-value="${escapeHtml(room.password)}">コピー</button></div></div>`
      : `<div class="room-share-list"><div class="room-share-row"><span><small>ROOM CODE</small><b>${escapeHtml(room.code)}</b></span><button class="secondary-button copy-button" data-copy-value="${escapeHtml(room.code)}">コピー</button></div><p class="waiting-note">パスワードは部屋作成者から共有してもらってください。</p></div>`;
    const settingsMarkup = room.isHost
      ? `<form class="room-settings" id="room-player-count-form"><label class="field-label" for="room-player-count">参加人数（CPUを含む）</label><div class="room-settings-row"><input id="room-player-count" name="playerCount" type="number" min="4" max="12" value="${escapeHtml(room.playerCount)}" required><button class="secondary-button" type="submit">人数を更新</button></div></form>`
      : "";
    return `<div class="shell">${header()}<main class="pass-screen"><div class="pass-card room-lobby"><div class="pass-icon">∴</div><div class="eyebrow">Room waiting room</div><h2>部屋 ${escapeHtml(room.code)}</h2><p>参加人数：${room.players.length}/${room.playerCount}人<br>部屋番号とパスワードを共有してください。ボタンでコピーできます。</p>${passwordMarkup}${settingsMarkup}<div class="room-members">${room.players.map((player) => `<div class="room-member"><span>${escapeHtml(player.name)}</span><small>${player.isHost ? "HOST" : "参加者"}${player.connected ? " · 接続中" : " · 切断"}</small></div>`).join("")}</div>${room.isHost ? `<button class="primary-button" id="start-online-game">ゲームを開始</button>` : `<div class="waiting-note">作成者がゲームを開始するまでお待ちください。</div>`}<button class="secondary-button" id="leave-room">部屋を退出</button>${errorMarkup()}</div></main></div>`;
  }

  function functionPlayer(player) {
    const mine = state.game.myPlayerId === player.id;
    // 自分の場合で、かつ関数情報（myFunction）が届いていれば関数名を表示する。
    // privateAction は投票フェーズなどで関数情報を含まないターンに上書きされるため、
    // 一度届いた自分の関数は myFunction に保持しておく。
    let expression = `F${player.id.slice(1)}(x) = ?`;
    if (mine && state.myFunction) {
      expression = escapeHtml(state.myFunction.label);
    } else if (mine && player.baseFunction) {
      // チュートリアル用のフォールバック
      expression = escapeHtml(player.baseFunction.label);
    }
    
    return `<div class="function-player ${player.alive ? "" : "dead"}"><div class="function-player-top"><span class="function-player-name">${player.alive ? "" : "† "}${escapeHtml(player.name)}${mine ? "（あなた）" : ""}</span>${player.human ? `<span class="human-badge">ONLINE</span>` : `<span class="human-badge">CPU</span>`}</div><div class="function-expression">${expression}</div><div class="function-family">秘密関数は本人だけが知る</div></div>`;
  }

  function leftPanel() {
    const game = state.game;
    return `<aside class="function-left"><section class="panel omega-card"><div class="panel-kicker">Known wolf function</div><div class="panel-title">人狼関数 W</div><div class="omega-expression">${escapeHtml(game.omegaLabel)}</div><div class="omega-note">この定義だけは全員の共通知識です。元の人狼は、この関数そのものを持っています。</div><div class="omega-symbol">W</div></section><section class="panel"><div class="panel-head"><div class="panel-kicker">Players</div><div class="panel-title">参加者</div></div><div class="function-roster">${game.players.map(functionPlayer).join("")}</div></section></aside>`;
  }

  function reportsMarkup() {
    if (!state.game.reports.length) return `<div class="report-empty">公開された観測結果はまだありません。</div>`;
    return `<div class="reports">${[...state.game.reports].reverse().map((report) => `<div class="report"><div class="report-head"><span>ROUND ${report.round} · ${escapeHtml(report.observerName)} → ${escapeHtml(report.targetName)}</span><span>REPORT</span></div><div class="report-formula">F<sub>${escapeHtml(report.observerName)}</sub> ∘ F<sub>${escapeHtml(report.targetName)}</sub> の符号は${escapeHtml(report.reportedSign)}です。</div><div class="message-gloss">「私の合成演算の符号は ${escapeHtml(report.reportedSign)} だった」</div></div>`).join("")}</div>`;
  }

  function waitingCard(title, body) { return `<div class="action-card waiting-card"><span class="private-role">WAITING</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p><div class="result-value">接続中のプレイヤーの操作を待っています</div></div>`; }

  function privateFunctionMarkup(action) {
    if (!action.function) return "";
    return `<div class="condition-box"><div class="condition-label">YOUR PRIVATE FUNCTION</div><div class="condition-value">${escapeHtml(action.function.label)}</div><div class="function-vector">[ ${action.function.table.join(" ")} ]</div></div>`;
  }

  function investigationView() {
    const action = state.privateAction;
    if (state.game.submitted) return waitingCard("観測を送信しました", "他のプレイヤーの観測が揃うまでお待ちください。");
    if (!action || action.kind !== "investigation" || action.playerId !== state.game.myPlayerId) return waitingCard("他のプレイヤーの観測中", "自分の観測を送信すると、他の人を待たずに待機できます。");
    return `<div class="action-card"><span class="private-role">${action.role === "wolf" ? "元の人狼" : "市民"}</span><h3>あなたの秘密観測</h3><p>自分の関数を外側、指名相手の関数を内側として合成します。結果の符号だけを公開できます。目標符号は「${signText(action.condition.targetSign)}」です。</p>${privateFunctionMarkup(action)}<div class="condition-box"><div class="condition-label">YOUR TEST</div><div class="condition-value">${escapeHtml(action.condition.label)}</div></div><div class="target-grid function-targets">${action.targets.map((target) => `<button class="target-button" data-investigate="${escapeHtml(target.id)}">${escapeHtml(target.name)}<span class="function-mini">秘密関数</span></button>`).join("")}</div></div>`;
  }

  function observationView() {
    const report = state.observation;
    if (!report) return investigationView();
    return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${escapeHtml(report.target.name)}の合成演算</h3><p>目標符号は「${signText(report.condition.targetSign)}」。この一件だけでは偽陽性と区別できません。公開されるのは符号だけです。</p><div class="condition-box"><div class="condition-label">Fself ∘ Ftarget</div><div class="condition-value">${escapeHtml(report.condition.label)}</div></div><div class="result-value">${escapeHtml(report.observed.display)}</div><div class="action-buttons"><button class="primary-button" data-publish="yes">符号を公開する</button>${state.privateAction?.role === "wolf" ? `<button class="danger-button" data-publish="lie">逆の符号を公開</button>` : ""}<button class="secondary-button" data-publish="no">結果を伏せる</button></div></div>`;
  }

  function discussionView() { return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>符号の公開</h2><p>公開された符号が目標符号と一致していても、市民による偽陽性の可能性があります。複数の結果を組み合わせてください。</p></div>${reportsMarkup()}<div class="action-buttons">${state.game.isHost ? `<button class="primary-button" id="begin-vote">投票を開始</button>` : `<span class="waiting-note">部屋主が投票を開始します</span>`}</div>`; }

  function voteView() {
    const action = state.privateAction;
    if (state.game.submitted) return waitingCard("投票を送信しました", "他のプレイヤーの投票が揃うまでお待ちください。");
    if (!action || action.kind !== "vote" || action.playerId !== state.game.myPlayerId) return waitingCard("他のプレイヤーの投票中", "自分の投票を送信すると、他の人を待たずに待機できます。");
    return `<div class="action-card"><span class="private-role">${action.role === "wolf" ? "元の人狼" : "市民"}</span><h3>あなたの投票</h3><p>追放する相手を選んでください。追放しないこともできます。</p><div class="target-grid function-targets">${action.targets.map((target) => `<button class="target-button" data-vote="${escapeHtml(target.id)}">${escapeHtml(target.name)}</button>`).join("")}<button class="target-button" data-vote="none">∅ 追放しない</button></div></div>`;
  }

  function tallyMarkup(result) {
    if (!result) return "";
    const total = Object.values(result.tally).reduce((sum, value) => sum + value, 0);
    return `<div class="tally">${Object.entries(result.tally).sort((a, b) => b[1] - a[1]).map(([choice, count]) => { const label = choice === "none" ? "追放しない" : state.game.players.find((player) => player.id === choice)?.name ?? choice; return `<div class="tally-row"><span>${escapeHtml(label)}</span><div class="tally-bar"><div class="tally-fill" style="width:${total ? count / total * 100 : 0}%"></div></div><b>${count}</b></div>`; }).join("")}</div>`;
  }

  function voteResultView() {
    const result = state.game.voteResult;
    const text = result?.exiled ? `${result.exiled.name}が追放されました。${result.exiled.role === "wolf" ? "元の人狼でした。" : "元の人狼ではありませんでした。"}` : "この日は誰も追放されませんでした。";
    return `<div class="action-card"><span class="private-role">VOTE RESULT</span><h3>投票結果</h3><p>${escapeHtml(text)}</p>${tallyMarkup(result)}<div class="action-buttons">${state.game.isHost ? `<button class="primary-button" id="begin-night">夜へ進む</button>` : `<span class="waiting-note">部屋主が夜を開始します</span>`}</div></div>`;
  }

  function nightView() {
    const action = state.privateAction;
    if (!action || action.kind !== "night" || action.playerId !== state.game.myPlayerId) return waitingCard("夜の処理中", "人狼が襲撃先を選ぶまでお待ちください。");
    if (!state.nightTargetId) {
      return `<div class="action-card"><span class="private-role">元の人狼</span><h3>襲撃対象を選ぶ</h3><p>まず襲う相手を選び、その後に相手の関数を推測します。関数の種類は分かりますが、誰がどの関数かは分かりません。</p><div class="target-grid function-targets">${action.targets.map((target) => `<button class="target-button" data-attack-target="${escapeHtml(target.id)}">${escapeHtml(target.name)}<span class="function-mini">関数は非公開</span></button>`).join("")}</div></div>`;
    }
    const target = action.targets.find((candidate) => candidate.id === state.nightTargetId);
    if (!target) return waitingCard("襲撃対象を確認中", "対象が更新されました。もう一度選び直してください。");
    const options = action.functionOptions ?? [];
    return `<div class="action-card"><span class="private-role">元の人狼</span><h3>${escapeHtml(target.name)}の関数を推測</h3><p>この推測が的中した場合だけ、対象の関数に W が合成されます。</p><div class="condition-box"><div class="condition-label">SELECTED TARGET</div><div class="condition-value">${escapeHtml(target.name)}</div></div><div class="target-grid function-targets">${options.map((option) => `<button class="target-button" data-attack-function="${escapeHtml(option.id)}">${escapeHtml(option.label)}</button>`).join("")}</div><div class="action-buttons"><button class="secondary-button" id="cancel-attack-target">対象を選び直す</button></div></div>`;
  }

  function nightResultView() {
    const privateResult = state.attackResult
      ? `<div class="condition-box"><div class="condition-label">YOUR ATTACK RESULT</div><div class="condition-value">${state.attackResult.success ? "成功：関数の推測が的中しました。" : "失敗：関数の推測が外れました。"}</div></div>`
      : "";
    return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3><p>人狼の襲撃処理が完了しました。関数の推測が的中した場合だけ、対象の関数に W が秘密裏に合成されます。対象者自身には変化が分かりません。</p>${privateResult}<div class="result-value">Fᵢ′ = W ∘ Fᵢ（的中時のみ）</div><div class="action-buttons">${state.game.isHost ? `<button class="primary-button" id="next-round">ROUND ${state.game.round + 1}へ</button>` : `<span class="waiting-note">部屋主が次のラウンドを開始します</span>`}</div></div>`;
  }

  function outcomeModal() {
    const outcome = state.game.outcome;
    if (!outcome) return "";
    const reveal = (state.game.reveal ?? []).map((player) => `<div class="outcome-person"><b>${escapeHtml(player.name)}</b><span>${player.role === "wolf" ? "元の人狼" : player.infected ? "襲撃済み市民" : "市民"}<br>${escapeHtml(player.functionLabel)}</span></div>`).join("");
    const attackResult = state.attackResult ? `<p class="condition-value">今回の襲撃：${state.attackResult.success ? "成功" : "失敗"}</p>` : "";
    const finalVote = state.game.voteResult ? `<section class="outcome-vote"><div class="panel-kicker">FINAL VOTE</div><h3>最終投票結果</h3>${tallyMarkup(state.game.voteResult)}</section>` : "";
    const restartAction = state.game.isHost
      ? `<div class="room-settings outcome-restart"><label class="field-label" for="restart-player-count">再戦人数（CPUを含む）</label><div class="room-settings-row"><input id="restart-player-count" type="number" min="4" max="12" value="${escapeHtml(state.room?.playerCount ?? state.game.playerCount ?? state.game.players.length)}" required><button class="primary-button" id="restart-room">この部屋で再戦</button></div></div>`
      : `<p class="waiting-note">部屋主が再戦を開始するまでお待ちください。</p>`;
    return `<div class="modal-backdrop"><div class="modal"><div class="modal-icon">${outcome.winner === "citizen" ? "∴" : "W"}</div><div class="eyebrow">Protocol concluded</div><h2>${outcome.winner === "citizen" ? "市民側の勝利" : "人狼側の勝利"}</h2><p>${escapeHtml(outcome.reason)}</p>${attackResult}${finalVote}<div class="outcome-reveal">${reveal}</div>${restartAction}<p class="waiting-note">部屋を退出すると、別の部屋に参加できます。</p><button class="secondary-button" id="leave-room">部屋を退出</button></div></div>`;
  }

  function rightPanel() {
    const roomCode = state.room?.code ?? "TUTORIAL";
    const progress = state.game.phase === "investigation" || state.game.phase === "vote" ? `未送信 ${state.game.pendingCount}人` : state.game.activePlayerName ? `${state.game.activePlayerName}の操作中` : "公開情報";
    return `<aside class="function-right"><section class="panel"><div class="panel-head"><div class="panel-kicker">Protocol</div><div class="panel-title">進行状況</div></div><div class="rule-list"><div class="rule-item"><div class="rule-number">ROOM</div><div class="rule-text">${escapeHtml(roomCode)} · ${escapeHtml(progress)}</div></div><div class="rule-item"><div class="rule-number">01</div><div class="rule-text">Wを個人関数として持つ元人狼を追放すれば市民側の勝利。</div></div><div class="rule-item"><div class="rule-number">02</div><div class="rule-text">調査は Fself ∘ Ftarget を秘密条件で評価する。</div></div><div class="rule-item"><div class="rule-number">03</div><div class="rule-text">襲撃済み市民の投票は元人狼の投票先へ自動置換。</div></div><div class="rule-item"><div class="rule-number">04</div><div class="rule-text">襲撃対象と関数推測が一致したときだけ秘密合成。</div></div></div></section></aside>`;
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

  return { header, errorMarkup, setupScreen, lobbyScreen, leftPanel, rightPanel, board };
}
