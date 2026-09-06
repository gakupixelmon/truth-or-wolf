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
  // チュートリアル用の状態管理
  tutorialMode: false,
  tutorialStep: "",
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
      <div class="result-value">sgn = +</div>
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
    state.humanCount = 1;
    state.game = new FunctionWolfGame({ humanCount: state.humanCount });
    state.voteResult = null;
    startInvestigationQueue(); 
    render();
  });
  document.querySelector("#tutorial-back-start")?.addEventListener("click", () => {
    state.tutorialMode = false;
    state.game = null; 
    state.view = "setup"; 
    render();
  });
}

function tutorialBoard() {
  return `<div class="shell">${header()}<div class="function-board">${leftPanel()}<main class="panel function-main"><div class="panel-head discussion-head"><div><div class="panel-kicker">Tutorial</div><div class="panel-title">ROUND ${state.game.round}</div></div><div class="phase-badge">TUTORIAL</div></div><div class="function-main-body">${tutorialMainContent()}</div></main>${rightPanel()}</div></div>`;
}

// ==========================================
// 通常の本編用スクリプト（既存コード）
// ==========================================

function header() {
  return `<header class="topbar">
    <div class="brand"><div class="brand-mark"><span>∘</span></div><div><div class="brand-name">TRUTH OR WOLF</div><div class="brand-sub">FUNCTION PROTOCOL</div></div></div>
    ${state.game ? `<div class="status-line"><span class="status-dot"></span><b>ROUND ${state.game.round}</b><span class="hide-mobile">生存 ${state.game.alivePlayers().length} / 7</span><span class="hide-mobile">LOCAL ${state.game.players.filter((p) => p.human).length}P</span></div>` : `<a class="mode-link" href="./classic.html">クラシック論理版 →</a>`}
  </header>`;
}

function setupScreen() {
  return `<div class="shell">${header()}
  <button id="start-tutorial" class="primary-button" style="position: absolute; top: 12px; right: 16px; z-index: 100; font-size: 12px; padding: 6px 12px;">チュートリアルはこちら</button>
  <main class="hero function-hero">
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
  return `<div class="reports">${[...reports].reverse().map((report) => `<div class="report"><div class="report-head"><span>ROUND ${report.round} · ${report.observer.name} → ${report.target.name}</span><span>REPORT</span></div><div class="report-formula">sgn(F<sub>${report.observer.name}</sub> ∘ F<sub>${report.target.name}</sub>) = ${report.reportedSign}</div><div class="message-gloss">「私の合成演算の符号は ${report.reportedSign} だった」</div></div>`).join("")}</div>`;
}

function publicDiscussion() {
  return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>符号の公開</h2><p>各人の秘密関数や目標符号は公開されません。公開された符号がその人の目標符号と一致していても、市民による偽陽性の可能性があります。</p></div>${reportsMarkup()}<div class="action-buttons"><button class="primary-button" id="start-vote">追放投票へ</button></div>`;
}

function investigationAction() {
  const game = state.game;
  const actor = game.players.find((player) => player.id === state.activePlayerId);
  const ownTable = game.privateFunctionTable(actor).join(" ");
  const history = game.investigationHistory.get(actor.id);
  const historyMarkup = history.length ? `<div class="private-history"><div class="condition-label">YOUR PAST RESULTS</div>${history.map((report) => `<div><span>${report.target.name}</span><b>${report.observed.symbol}</b><small>${report.observed.display}</small></div>`).join("")}</div>` : "";
  const targetSignText = actor.condition.targetSign === "positive" ? "正" : "負";
  return `<div class="action-card"><span class="private-role">${actor.role === "wolf" ? "元の人狼" : "市民"}</span><h3>${actor.name}の秘密観測</h3><p>自分の関数を外側、指名相手の関数を内側として F<sub>self</sub> ∘ F<sub>target</sub> を観測します。元人狼なら結果は必ず${targetSignText}になりますが、市民でも${targetSignText}になる場合があります。</p><div class="condition-box"><div class="condition-label">YOUR PRIVATE FUNCTION</div><div class="condition-value">${actor.baseFunction.label}</div><div class="function-vector">[ ${ownTable} ]</div></div><div class="condition-box"><div class="condition-label">YOUR TEST</div><div class="condition-value">${actor.condition.label}</div></div>${historyMarkup}<div class="target-grid function-targets">${game.alivePlayers().filter((player) => player.id !== actor.id).map((player) => `<button class="target-button" data-investigate="${player.id}">${player.name}<span class="function-mini">F${player.id.slice(1)}(x) = ?</span></button>`).join("")}</div></div>`;
}

function observationResult() {
  const report = state.observation;
  const targetSignText = report.condition.targetSign === "positive" ? "正" : "負";
  return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${report.target.name}の合成演算</h3><p>${targetSignText}なら元人狼の可能性がありますが、この一件だけでは偽陽性と区別できません。公開されるのは符号だけです。</p><div class="condition-box"><div class="condition-label">Fself ∘ Ftarget</div><div class="condition-value">${report.condition.label}</div></div><div class="result-value">${report.observed.display}</div><div class="action-buttons"><button class="primary-button" data-publish="yes">符号を公開する</button>${report.observer.role === "wolf" ? `<button class="danger-button" data-publish="lie">逆の符号を公開</button>` : ""}<button class="secondary-button" data-publish="no">結果を伏せる</button></div></div>`;
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
  if (state.tutorialMode) {
    if (!state.game) startTutorialGame();
    app.innerHTML = tutorialStyle() + tutorialBoard();
    if (state.game.outcome) app.innerHTML += tutorialOverlay();
    else app.innerHTML += tutorialMessageOverlay();
    tutorialBindEvents();
    return;
  }

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
      const isMatch = !state.observation.isMatch;
      const expectedSymbol = state.observation.condition.targetSign === "positive" ? "+" : "−";
      const unexpectedSymbol = state.observation.condition.targetSign === "positive" ? "−" : "+";
      const reportedSign = isMatch ? expectedSymbol : unexpectedSymbol;
      state.game.publishReport({ ...state.observation, isMatch, reportedSign, truthful: false }, true);
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
  
  // チュートリアル用の開始ボタンイベント
  document.querySelector("#start-tutorial")?.addEventListener("click", () => {
    state.tutorialMode = true;
    state.game = null; 
    render();
  });
}

render();