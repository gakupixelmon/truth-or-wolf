export function createTutorial({ state, views, render }) {
  function startTutorialGame() {
    state.tutorialStep = "intro";
    state.game = {
      round: 1, phase: "tutorial", omegaLabel: "W(x) = 2x²", myPlayerId: "p0", pendingCount: 0, submitted: false,
      reports: [], activePlayerName: null, isHost: true, omega: { label: "W(x) = 2x²" }, outcome: null,
      players: [
        { id: "p0", name: "あなた", human: true, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 1" }, condition: { label: "x = 2 で符号を見る", targetSign: "positive" } },
        { id: "p1", name: "アオイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = 2x" } },
        { id: "p2", name: "レン", human: false, alive: true, role: "wolf", baseFunction: { label: "f(x) = W(x)" } },
        { id: "p3", name: "ミナト", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 3" } },
        { id: "p4", name: "ユイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x²" } },
        { id: "p5", name: "カイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = 3x" } },
        { id: "p6", name: "スズ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 2" } },
      ],
      alivePlayers() { return this.players.filter((p) => p.alive); },
    };
  }

  function tutorialStyle() { return `<style>.highlight-btn{box-shadow:0 0 10px 4px rgba(255,215,0,.8)!important;border-color:#ffd700!important;position:relative;z-index:10;animation:pulse-glow 1.5s infinite}@keyframes pulse-glow{0%{box-shadow:0 0 10px 4px rgba(255,215,0,.8)}50%{box-shadow:0 0 20px 8px rgba(255,215,0,.4)}100%{box-shadow:0 0 10px 4px rgba(255,215,0,.8)}}.disabled-target{opacity:.3!important;pointer-events:none!important}.chat-container{background:#1e1e1e;border:1px solid #444;padding:12px;border-radius:6px;margin:16px 0;color:#eee}.chat-message{margin-bottom:10px;font-size:14px;line-height:1.5}.chat-message strong{color:#ffb74d}</style>`; }

  function tutorialMainContent() {
    const step = state.tutorialStep;
    const alivePlayers = state.game.alivePlayers().filter((p) => p.id !== "p0");
    if (step === "intro") return `<div class="action-card"><span class="private-role">TUTORIAL</span><h3>関数人狼へようこそ</h3><p>このゲームでは、全員に秘密の「関数」が配られます。他人の関数を調査し、会話と推理で人狼を探し出しましょう。</p><div class="condition-box"><div class="condition-label">勝利条件</div><div class="condition-value" style="font-size:14px;text-align:left;padding:12px;line-height:1.6"><b>市民陣営：</b>人狼（人狼関数Wを持つ人）を投票で追放すれば勝利<br><b>人狼陣営：</b>人狼と「夜に感染した市民」の合計が生存者の過半数になれば勝利</div></div><div class="condition-box"><div class="condition-label">関数の合成と符号の調査とは？</div><div class="condition-value" style="font-size:14px;text-align:left;padding:12px;line-height:1.6"><b>関数の合成：</b>相手の関数に自分の関数を代入すること。<br><span style="font-size:12px;color:#aaa">（例：自分が f(x)=2x、相手が g(x)=x+1 なら、f(g(x))=2(x+1) を計算）</span><br><br><b>符号の調査：</b>合成した関数に特定の値を代入し、計算結果の「符号（プラスかマイナスか）」だけを調べること。</div></div><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-start-investigation">調査を始める</button></div></div>`;
    if (step === "day1-investigate" || step === "day2-investigate") {
      const targetId = step === "day1-investigate" ? "p3" : "p2";
      const targetName = step === "day1-investigate" ? "ミナト" : "レン";
      return `<div class="action-card"><span class="private-role">市民</span><h3>あなたの秘密観測</h3><p>調査したい相手を選んでください。（チュートリアルでは <b>${targetName}</b> を選択します）</p><div class="target-grid function-targets">${alivePlayers.map((p) => `<button class="target-button ${p.id === targetId ? "highlight-btn" : "disabled-target"}" data-tut-target="${p.id}">${p.name}<span class="function-mini">F${p.id.slice(1)}(x) = ?</span></button>`).join("")}</div></div>`;
    }
    if (step === "day1-observation" || step === "day2-observation") {
      const targetName = step === "day1-observation" ? "ミナト" : "レン";
      return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${targetName}の合成演算</h3><p>計算結果の符号が出ました。結果を村に公開しましょう。</p><div class="result-value">符号は＋です</div><div class="action-buttons"><button class="primary-button highlight-btn" data-tut-pub="yes">符号を公開する</button><button class="secondary-button disabled-target">結果を伏せる</button></div></div>`;
    }
    if (step === "day1-discussion" || step === "day2-discussion") {
      const day1 = step === "day1-discussion";
      const chats = day1 ? `<div class="chat-message"><strong>アオイ:</strong> 私の計算だとマイナスだった。ミナトの符号が合わないな。</div><div class="chat-message"><strong>カイ:</strong> 私もミナトが偽装しているように見えます。</div><div class="chat-message"><strong>スズ:</strong> 確かにミナトが怪しいですね。投票しましょう。</div>` : `<div class="chat-message"><strong>ユイ:</strong> レンの関数が W の条件に完全に一致している！</div><div class="chat-message"><strong>カイ:</strong> W(x) を持っているのはレンで確定だ！</div><div class="chat-message"><strong>アオイ:</strong> レンが人狼ですね。彼を追放しましょう！</div>`;
      const targetName = day1 ? "ミナト" : "レン";
      return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>符号の公開と議論</h2><div class="chat-container">${chats}</div><p style="color:#ff4d4d;font-weight:bold">${targetName}が怪しいようです。追放投票を行いましょう。</p></div><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-go-vote">追放投票へ</button></div>`;
    }
    if (step === "day1-vote" || step === "day2-vote") {
      const targetId = step === "day1-vote" ? "p3" : "p2";
      const targetName = step === "day1-vote" ? "ミナト" : "レン";
      return `<div class="action-card"><span class="private-role">市民</span><h3>あなたの投票</h3><p>議論をもとに、<b>${targetName}</b> に投票してください。</p><div class="target-grid function-targets">${alivePlayers.map((p) => `<button class="target-button ${p.id === targetId ? "highlight-btn" : "disabled-target"}" data-tut-vote="${p.id}">${p.name}</button>`).join("")}</div></div>`;
    }
    if (step === "day1-voteresult" || step === "day2-voteresult") {
      const day1 = step === "day1-voteresult";
      const targetName = day1 ? "ミナト" : "レン";
      const roleName = day1 ? "市民" : "人狼";
      const nextBtnId = day1 ? "tut-go-night" : "tut-finish";
      return `<div class="action-card"><span class="private-role">VOTE RESULT</span><h3>投票結果</h3><p>投票の結果、${targetName}が追放されました。彼は「<b>${roleName}</b>」でした。</p><div class="action-buttons"><button class="primary-button highlight-btn" id="${nextBtnId}">${day1 ? "夜へ進む" : "チュートリアルを終了する"}</button></div></div>`;
    }
    if (step === "day2-nightresult") return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3><p>夜の間に誰かの関数が感染したかもしれません。再び調査を始めましょう。</p><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-next-round">ROUND 2へ</button></div></div>`;
    return "";
  }

  function tutorialMessageOverlay() {
    if (state.game.outcome) return "";
    const messages = { intro: "まずはルールを確認しましょう。確認できたら「調査を始める」ボタンを押してください。", "day1-investigate": "まずはミナトを調査してみましょう。光っているボタンを押してください。", "day1-observation": "結果が出ました。符号を村全体に公開しましょう。", "day1-discussion": "他のプレイヤーが議論を始めました。投票に進みましょう。", "day1-vote": "ミナトに追放投票をしましょう。", "day1-voteresult": "ミナトが追放されましたが、彼は市民でした。夜へ進みましょう。", "day2-nightresult": "夜が明けました。次のラウンドへ進みましょう。", "day2-investigate": "今度はレンを調査してみましょう。", "day2-observation": "結果が出ました。村に公開しましょう。", "day2-discussion": "議論の結果、レンが人狼であると判明したようです！", "day2-vote": "レンに投票して追放しましょう。", "day2-voteresult": "レンを追放しました！彼が人狼でした。" };
    return `<div style="position:fixed;bottom:24px;right:24px;background:rgba(0,0,0,.85);color:#fff;padding:16px 24px;border-radius:8px;z-index:1000;text-align:left;width:340px;max-width:90vw;box-shadow:0 4px 12px rgba(0,0,0,.3);pointer-events:none"><p style="margin:0;line-height:1.6;font-size:14px">【チュートリアル】${messages[state.tutorialStep] ?? ""}</p></div>`;
  }

  function tutorialOverlay() {
    if (!state.game.outcome) return "";
    return `<div class="modal-backdrop" style="z-index:2000;background:rgba(0,0,0,.85)"><div class="modal" style="text-align:center;padding:40px 24px;pointer-events:auto"><div class="modal-icon">∴</div><h2>チュートリアル完了！</h2><p style="margin-bottom:24px">一連の議論と投票の流れは以上です。<br><b>今回の決着理由：</b>${state.game.outcome.reason}</p><div class="action-buttons" style="display:flex;flex-direction:column;gap:12px;align-items:center"><button class="primary-button" id="tutorial-play-real" style="width:100%;max-width:300px">実際にゲームを始める</button><button class="secondary-button" id="tutorial-back-start" style="width:100%;max-width:300px">スタート画面に戻る</button></div></div></div>`;
  }

  function tutorialBoard() {
    return `<div class="shell">${views.header()}<div class="function-board">${views.leftPanel()}<main class="panel function-main"><div class="panel-head discussion-head"><div><div class="panel-kicker">Tutorial</div><div class="panel-title">ROUND ${state.game.round}</div></div><div class="phase-badge">TUTORIAL</div></div><div class="function-main-body">${tutorialMainContent()}</div></main>${views.rightPanel()}</div></div>`;
  }

  function bindEvents() {
    document.querySelector("#tut-start-investigation")?.addEventListener("click", () => { state.tutorialStep = "day1-investigate"; render(); });
    document.querySelectorAll("[data-tut-target]").forEach((b) => b.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "day1-investigate" ? "day1-observation" : "day2-observation"; render(); }));
    document.querySelectorAll("[data-tut-pub]").forEach((b) => b.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "day1-observation" ? "day1-discussion" : "day2-discussion"; render(); }));
    document.querySelector("#tut-go-vote")?.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "day1-discussion" ? "day1-vote" : "day2-vote"; render(); });
    document.querySelectorAll("[data-tut-vote]").forEach((b) => b.addEventListener("click", () => { const day1 = state.tutorialStep === "day1-vote"; state.game.players.find((p) => p.id === (day1 ? "p3" : "p2")).alive = false; state.tutorialStep = day1 ? "day1-voteresult" : "day2-voteresult"; render(); }));
    document.querySelector("#tut-go-night")?.addEventListener("click", () => { state.game.round = 2; state.tutorialStep = "day2-nightresult"; render(); });
    document.querySelector("#tut-next-round")?.addEventListener("click", () => { state.tutorialStep = "day2-investigate"; render(); });
    document.querySelector("#tut-finish")?.addEventListener("click", () => { state.game.outcome = { winner: "citizen", reason: "人狼関数を持つレンを追放した。" }; render(); });
    document.querySelector("#tutorial-play-real")?.addEventListener("click", () => { state.tutorialMode = false; state.game = null; state.room = null; state.error = null; render(); });
    document.querySelector("#tutorial-back-start")?.addEventListener("click", () => { state.tutorialMode = false; state.game = null; state.room = null; state.error = null; render(); });
  }

  return { startTutorialGame, tutorialStyle, tutorialBoard, tutorialMessageOverlay, tutorialOverlay, bindEvents };
}

