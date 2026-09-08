import { FunctionWolfGame } from "./function-game.js";

const socket = io();
const app = document.querySelector("#app");

const state = {
  connected: false,
  room: null,
  game: null,
  privateAction: null,
  observation: null,
  humanVotes: new Map(),
  voteResult: null,
  // チュートリアル用の状態管理
  tutorialMode: false,
  tutorialStep: "",
  error: null,
};

// ==========================================
// チュートリアル専用のスタイルとスクリプト
// ==========================================

function tutorialStyle() {
  return `<style>
    .highlight-btn {
      box-shadow: 0 0 10px 4px rgba(255, 215, 0, 0.8) !important;
      border-color: #ffd700 !important;
      position: relative;
      z-index: 10;
      animation: pulse-glow 1.5s infinite;
    }
    @keyframes pulse-glow {
      0% { box-shadow: 0 0 10px 4px rgba(255, 215, 0, 0.8); }
      50% { box-shadow: 0 0 20px 8px rgba(255, 215, 0, 0.4); }
      100% { box-shadow: 0 0 10px 4px rgba(255, 215, 0, 0.8); }
    }
    .disabled-target {
      opacity: 0.3 !important;
      pointer-events: none !important;
    }
    .chat-container {
      background: #1e1e1e;
      border: 1px solid #444;
      padding: 12px;
      border-radius: 6px;
      margin: 16px 0;
      color: #eee;
    }
    .chat-message {
      margin-bottom: 10px;
      font-size: 14px;
      line-height: 1.5;
    }
    .chat-message strong {
      color: #ffb74d;
    }
  </style>`;
}

function startTutorialGame() {
  state.tutorialStep = "intro"; // 最初にintroステップを追加
  // 固定化されたチュートリアル用ダミーゲームデータ
  state.game = {
    round: 1,
    phase: "tutorial",
    omegaLabel: "W(x) = 2x²",
    myPlayerId: "p0",
    pendingCount: 0,
    submitted: false,
    reports: [],
    activePlayerName: null,
    isHost: true,
    omega: { label: "W(x) = 2x²" },
    outcome: null,
    players: [
      { id: "p0", name: "あなた", human: true, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 1" }, condition: { label: "x = 2 で符号を見る", targetSign: "positive" } },
      { id: "p1", name: "アオイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = 2x" } },
      { id: "p2", name: "レン", human: false, alive: true, role: "wolf", baseFunction: { label: "f(x) = W(x)" } },
      { id: "p3", name: "ミナト", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 3" } },
      { id: "p4", name: "ユイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x²" } },
      { id: "p5", name: "カイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = 3x" } },
      { id: "p6", name: "スズ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 2" } }
    ],
    alivePlayers() { return this.players.filter(p => p.alive); }
  };
}

function tutorialMainContent() {
  const step = state.tutorialStep;
  const alivePlayers = state.game.alivePlayers().filter(p => p.id !== "p0");

  if (step === "intro") {
    return `<div class="action-card"><span class="private-role">TUTORIAL</span><h3>関数人狼へようこそ</h3>
      <p>このゲームでは、全員に秘密の「関数」が配られます。他人の関数を調査し、会話と推理で人狼を探し出しましょう。</p>
      <div class="condition-box">
        <div class="condition-label">勝利条件</div>
        <div class="condition-value" style="font-size: 14px; text-align: left; padding: 12px; line-height: 1.6;">
          <b>市民陣営：</b> 人狼（人狼関数Wを持つ人）を投票で追放すれば勝利<br>
          <b>人狼陣営：</b> 人狼と「夜に感染した市民」の合計が生存者の過半数になれば勝利
        </div>
      </div>
      <div class="condition-box">
        <div class="condition-label">関数の合成と符号の調査とは？</div>
        <div class="condition-value" style="font-size: 14px; text-align: left; padding: 12px; line-height: 1.6;">
          <b>関数の合成：</b> 相手の関数に自分の関数を代入すること。<br>
          <span style="font-size: 12px; color: #aaa;">（例：自分が f(x) = 2x、相手が g(x) = x + 1 なら、f(g(x)) = 2(x + 1) を計算）</span><br><br>
          <b>符号の調査：</b> 合成した関数に特定の値を代入し、その計算結果の「符号（プラスかマイナスか）」だけを調べること。この符号を村に公開し、矛盾を探します。
        </div>
      </div>
      <div class="action-buttons"><button class="primary-button highlight-btn" id="tut-start-investigation">調査を始める</button></div>
    </div>`;
  }

  if (step === "day1-investigate" || step === "day2-investigate") {
    const targetId = step === "day1-investigate" ? "p3" : "p2";
    const targetName = step === "day1-investigate" ? "ミナト" : "レン";
    return `<div class="action-card"><span class="private-role">市民</span><h3>あなたの秘密観測</h3>
      <p>調査したい相手を選んでください。（チュートリアルでは <b>${targetName}</b> を選択します）</p>
      <div class="target-grid function-targets">
        ${alivePlayers.map(p => `
          <button class="target-button ${p.id === targetId ? "highlight-btn" : "disabled-target"}" data-tut-target="${p.id}">
            ${p.name}<span class="function-mini">F${p.id.slice(1)}(x) = ?</span>
          </button>
        `).join("")}
      </div></div>`;
  }
  
  if (step === "day1-observation" || step === "day2-observation") {
    const targetName = step === "day1-observation" ? "ミナト" : "レン";
    return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${targetName}の合成演算</h3>
      <p>計算結果の符号が出ました。結果を村に公開しましょう。</p>
      <div class="result-value">符号は＋です</div>
      <div class="action-buttons">
        <button class="primary-button highlight-btn" data-tut-pub="yes">符号を公開する</button>
        <button class="secondary-button disabled-target">結果を伏せる</button>
      </div></div>`;
  }

  if (step === "day1-discussion" || step === "day2-discussion") {
    const isDay1 = step === "day1-discussion";
    const chats = isDay1 
      ? `<div class="chat-message"><strong>アオイ:</strong> 私の計算だとマイナスだった。ミナトの符号が合わないな。</div>
         <div class="chat-message"><strong>カイ:</strong> 私もミナトが偽装しているように見えます。</div>
         <div class="chat-message"><strong>スズ:</strong> 確かにミナトが怪しいですね。投票しましょう。</div>`
      : `<div class="chat-message"><strong>ユイ:</strong> レンの関数が W の条件に完全に一致している！</div>
         <div class="chat-message"><strong>カイ:</strong> W(x) を持っているのはレンで確定だ！</div>
         <div class="chat-message"><strong>アオイ:</strong> レンが人狼ですね。彼を追放しましょう！</div>`;
    const targetName = isDay1 ? "ミナト" : "レン";
    return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>符号の公開と議論</h2>
      <div class="chat-container">${chats}</div>
      <p style="color: #ff4d4d; font-weight: bold;">${targetName}が怪しいようです。追放投票を行いましょう。</p>
      </div>
      <div class="action-buttons"><button class="primary-button highlight-btn" id="tut-go-vote">追放投票へ</button></div>`;
  }

  if (step === "day1-vote" || step === "day2-vote") {
    const targetId = step === "day1-vote" ? "p3" : "p2";
    const targetName = step === "day1-vote" ? "ミナト" : "レン";
    return `<div class="action-card"><span class="private-role">市民</span><h3>あなたの投票</h3>
      <p>議論をもとに、<b>${targetName}</b> に投票してください。</p>
      <div class="target-grid function-targets">
        ${alivePlayers.map(p => `
          <button class="target-button ${p.id === targetId ? "highlight-btn" : "disabled-target"}" data-tut-vote="${p.id}">${p.name}</button>
        `).join("")}
      </div></div>`;
  }

  if (step === "day1-voteresult" || step === "day2-voteresult") {
    const isDay1 = step === "day1-voteresult";
    const targetName = isDay1 ? "ミナト" : "レン";
    const roleName = isDay1 ? "市民" : "人狼";
    const nextBtnId = isDay1 ? "tut-go-night" : "tut-finish";
    const nextBtnText = isDay1 ? "夜へ進む" : "チュートリアルを終了する";
    return `<div class="action-card"><span class="private-role">VOTE RESULT</span><h3>投票結果</h3>
      <p>投票の結果、${targetName}が追放されました。彼は「<b>${roleName}</b>」でした。</p>
      <div class="action-buttons"><button class="primary-button highlight-btn" id="${nextBtnId}">${nextBtnText}</button></div></div>`;
  }

  if (step === "day2-nightresult") {
    return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3>
      <p>夜の間に誰かの関数が感染したかもしれません。再び調査を始めましょう。</p>
      <div class="action-buttons"><button class="primary-button highlight-btn" id="tut-next-round">ROUND 2へ</button></div></div>`;
  }

  return "";
}

function tutorialMessageOverlay() {
  if (state.game.outcome) return "";
  const step = state.tutorialStep;
  let msg = "";
  if (step === "intro") msg = "【チュートリアル】まずはルールを確認しましょう。確認できたら「調査を始める」ボタンを押してください。";
  if (step === "day1-investigate") msg = "【チュートリアル】まずはミナトを調査してみましょう。光っているボタンを押してください。";
  if (step === "day1-observation") msg = "【チュートリアル】結果が出ました。符号を村全体に公開しましょう。光っているボタンを押してください。";
  if (step === "day1-discussion") msg = "【チュートリアル】他のプレイヤーが議論を始めました。どうやらミナトが怪しまれているようです。光っているボタンを押して投票に進みましょう。";
  if (step === "day1-vote") msg = "【チュートリアル】ミナトに追放投票をしましょう。光っているボタンを押してください。";
  if (step === "day1-voteresult") msg = "【チュートリアル】ミナトが追放されましたが、彼は市民でした。ゲームはまだ続きます。夜へ進みましょう。";
  if (step === "day2-nightresult") msg = "【チュートリアル】夜が明けました。人狼がまだ潜んでいます。次のラウンドへ進みましょう。";
  if (step === "day2-investigate") msg = "【チュートリアル】今度はレンを調査してみましょう。光っているボタンを押してください。";
  if (step === "day2-observation") msg = "【チュートリアル】結果が出ました。村に公開しましょう。";
  if (step === "day2-discussion") msg = "【チュートリアル】議論の結果、レンが人狼であると判明したようです！投票へ進みましょう。";
  if (step === "day2-vote") msg = "【チュートリアル】レンに投票して追放しましょう。";
  if (step === "day2-voteresult") msg = "【チュートリアル】レンを追放しました！彼が人狼でした。チュートリアルを終了しましょう。";

  return `
    <div style="position: fixed; bottom: 24px; right: 24px; background: rgba(0,0,0,0.85); color: #fff; padding: 16px 24px; border-radius: 8px; z-index: 1000; text-align: left; width: 340px; max-width: 90vw; box-shadow: 0 4px 12px rgba(0,0,0,0.3); pointer-events: none;">
      <p style="margin: 0; line-height: 1.6; font-size: 14px;">${msg}</p>
    </div>
  `;
}

function tutorialOverlay() {
  if (!state.game.outcome) return "";
  return `
    <div class="modal-backdrop" style="z-index: 2000; background: rgba(0,0,0,0.85);">
      <div class="modal" style="text-align: center; padding: 40px 24px; pointer-events: auto;">
        <div class="modal-icon">∴</div>
        <h2>チュートリアル完了！</h2>
        <p style="margin-bottom: 24px;">
          一連の議論と投票の流れは以上です。<br>
          <b>今回の決着理由：</b>${state.game.outcome.reason}<br><br>
          会話による推理を駆使して、本番のゲームに挑んでみましょう。
        </p>
        <div class="action-buttons" style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
          <button class="primary-button" id="tutorial-play-real" style="width: 100%; max-width: 300px;">実際にゲームを始める</button>
          <button class="secondary-button" id="tutorial-back-start" style="width: 100%; max-width: 300px;">スタート画面に戻る</button>
        </div>
      </div>
    </div>
  `;
}

function tutorialBindEvents() {
  document.querySelector("#tut-start-investigation")?.addEventListener("click", () => {
    state.tutorialStep = "day1-investigate";
    render();
  });
  document.querySelectorAll("[data-tut-target]").forEach(b => b.addEventListener("click", () => {
    state.tutorialStep = state.tutorialStep === "day1-investigate" ? "day1-observation" : "day2-observation";
    render();
  }));
  document.querySelectorAll("[data-tut-pub]").forEach(b => b.addEventListener("click", () => {
    state.tutorialStep = state.tutorialStep === "day1-observation" ? "day1-discussion" : "day2-discussion";
    render();
  }));
  document.querySelector("#tut-go-vote")?.addEventListener("click", () => {
    state.tutorialStep = state.tutorialStep === "day1-discussion" ? "day1-vote" : "day2-vote";
    render();
  });
  document.querySelectorAll("[data-tut-vote]").forEach(b => b.addEventListener("click", () => {
    const isDay1 = state.tutorialStep === "day1-vote";
    if (isDay1) {
      state.game.players.find(p => p.id === "p3").alive = false; // ミナト死亡
    } else {
      state.game.players.find(p => p.id === "p2").alive = false; // レン死亡
    }
    state.tutorialStep = isDay1 ? "day1-voteresult" : "day2-voteresult";
    render();
  }));
  document.querySelector("#tut-go-night")?.addEventListener("click", () => {
    state.game.round = 2;
    state.tutorialStep = "day2-nightresult";
    render();
  });
  document.querySelector("#tut-next-round")?.addEventListener("click", () => {
    state.tutorialStep = "day2-investigate";
    render();
  });
  document.querySelector("#tut-finish")?.addEventListener("click", () => {
    state.game.outcome = { winner: "citizen", reason: "人狼関数を持つレンを追放した。" };
    render();
  });
  
  // 終了画面からの復帰
  document.querySelector("#tutorial-play-real")?.addEventListener("click", () => {
    state.tutorialMode = false;
    state.game = null;
    state.room = null;
    state.error = null;
    render();
  });
  document.querySelector("#tutorial-back-start")?.addEventListener("click", () => {
    state.tutorialMode = false;
    state.game = null;
    state.room = null;
    state.error = null;
    render();
  });
}

function tutorialBoard() {
  return `<div class="shell">${header()}<div class="function-board">${leftPanel()}<main class="panel function-main"><div class="panel-head discussion-head"><div><div class="panel-kicker">Tutorial</div><div class="panel-title">ROUND ${state.game.round}</div></div><div class="phase-badge">TUTORIAL</div></div><div class="function-main-body">${tutorialMainContent()}</div></main>${rightPanel()}</div></div>`;
}

// ==========================================
// 通常の本編用スクリプト（既存コード）
// ==========================================

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
  return `<div class="shell">${header()}<button id="start-tutorial" class="primary-button" style="position: absolute; top: 88px; right: 16px; z-index: 10; font-size: 12px; padding: 6px 12px;">チュートリアルはこちら</button><main class="hero function-hero"><section>
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
  // 自分の場合で、かつ秘密情報（privateAction）が届いていれば関数名を表示する
  let expression = `F${player.id.slice(1)}(x) = ?`;
  if (mine && state.privateAction && state.privateAction.function) {
    expression = escapeHtml(state.privateAction.function.label);
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
  const roomCode = state.room?.code ?? "TUTORIAL";
  const progress = state.game.phase === "investigation" || state.game.phase === "vote"
    ? `未送信 ${state.game.pendingCount}人`
    : state.game.activePlayerName ? `${state.game.activePlayerName}の操作中` : "公開情報";
  return `<aside class="function-right"><section class="panel"><div class="panel-head"><div class="panel-kicker">Protocol</div><div class="panel-title">進行状況</div></div><div class="rule-list"><div class="rule-item"><div class="rule-number">ROOM</div><div class="rule-text">${escapeHtml(roomCode)} · ${escapeHtml(progress)}</div></div><div class="rule-item"><div class="rule-number">01</div><div class="rule-text">Wを個人関数として持つ元人狼を追放すれば市民側の勝利。</div></div><div class="rule-item"><div class="rule-number">02</div><div class="rule-text">調査は Fself ∘ Ftarget を秘密条件で評価する。</div></div><div class="rule-item"><div class="rule-number">03</div><div class="rule-text">襲撃済み市民の投票は元人狼の投票先へ自動置換。</div></div></div></section></aside>`;
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
  if (state.tutorialMode) {
    if (!state.game) startTutorialGame();
    app.innerHTML = tutorialStyle() + tutorialBoard();
    if (state.game.outcome) app.innerHTML += tutorialOverlay();
    else app.innerHTML += tutorialMessageOverlay();
    tutorialBindEvents();
    return;
  }

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
  document.querySelector("#start-tutorial")?.addEventListener("click", () => {
    state.tutorialMode = true;
    state.game = null; 
    render();
  });
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
