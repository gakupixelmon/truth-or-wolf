const WOLF_FUNCTION_OPTIONS = [
  { id: "fn-2x", label: "f(x) = 2x" },
  { id: "fn-x-1", label: "f(x) = x − 1" },
  { id: "fn-x+3", label: "f(x) = x + 3" },
  { id: "fn-x2", label: "f(x) = x²" },
  { id: "fn-3x", label: "f(x) = 3x" },
  { id: "fn-x+2", label: "f(x) = x + 2" },
];

export function createTutorial({ state, views, render }) {
  function buildCitizenTutorialGame() {
    return {
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

  function buildWolfTutorialGame() {
    return {
      round: 1, phase: "tutorial", omegaLabel: "W(x) = 2x²", myPlayerId: "p0", pendingCount: 0, submitted: false,
      reports: [], activePlayerName: null, isHost: true, omega: { label: "W(x) = 2x²" }, outcome: null,
      players: [
        { id: "p0", name: "あなた", human: true, alive: true, role: "wolf", baseFunction: { label: "f(x) = W(x)" }, condition: { label: "x = 3 で符号を見る", targetSign: "negative" } },
        { id: "p1", name: "アオイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = 2x" }, functionId: "fn-2x" },
        { id: "p2", name: "レン", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x − 1" }, functionId: "fn-x-1" },
        { id: "p3", name: "ミナト", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 3" }, functionId: "fn-x+3" },
        { id: "p4", name: "ユイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x²" }, functionId: "fn-x2" },
        { id: "p5", name: "カイ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = 3x" }, functionId: "fn-3x" },
        { id: "p6", name: "スズ", human: false, alive: true, role: "citizen", baseFunction: { label: "f(x) = x + 2" }, functionId: "fn-x+2" },
      ],
      alivePlayers() { return this.players.filter((p) => p.alive); },
    };
  }

  function startTutorialGame() {
    const role = state.tutorialRole ?? "citizen";
    state.tutorialStep = role === "wolf" ? "wolf-intro" : "intro";
    state.game = role === "wolf" ? buildWolfTutorialGame() : buildCitizenTutorialGame();
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

    // ここから人狼視点チュートリアル
    if (step === "wolf-intro") return `<div class="action-card"><span class="private-role">TUTORIAL</span><h3>人狼視点のチュートリアル</h3><p>あなたは人狼関数 W を持つ「元の人狼」です。市民に紛れて生き残りながら、夜ごとに市民の関数を推測し、的中させて感染を広げましょう。</p><div class="condition-box"><div class="condition-label">勝利条件</div><div class="condition-value" style="font-size:14px;text-align:left;padding:12px;line-height:1.6"><b>市民陣営：</b>人狼（人狼関数Wを持つ人）を投票で追放すれば勝利<br><b>人狼陣営：</b>人狼と「夜に感染した市民」の合計が生存者の過半数になれば勝利</div></div><div class="condition-box"><div class="condition-label">人狼としての立ち回り</div><div class="condition-value" style="font-size:14px;text-align:left;padding:12px;line-height:1.6"><b>昼：</b>市民と同じように調査・符号公開・議論・投票に参加し、疑われないよう振る舞います。<br><b>夜：</b>市民を1人選んで関数の種類を推測します。的中すれば、対象にWを秘密裏に合成（感染）できます。誰がどの関数を持つかは分からないため、推測は運とかまかけが必要です。</div></div><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-wolf-start-investigation">調査を始める</button></div></div>`;
    if (step === "wolf-day1-investigate" || step === "wolf-day2-investigate") {
      const targetId = step === "wolf-day1-investigate" ? "p3" : "p6";
      const targetName = step === "wolf-day1-investigate" ? "ミナト" : "スズ";
      return `<div class="action-card"><span class="private-role">元の人狼</span><h3>あなたの秘密観測</h3><p>疑われないよう、市民と同じように調査を行います。（チュートリアルでは <b>${targetName}</b> を選択します）</p><div class="target-grid function-targets">${alivePlayers.map((p) => `<button class="target-button ${p.id === targetId ? "highlight-btn" : "disabled-target"}" data-tut-wolf-target="${p.id}">${p.name}<span class="function-mini">F${p.id.slice(1)}(x) = ?</span></button>`).join("")}</div></div>`;
    }
    if (step === "wolf-day1-observation" || step === "wolf-day2-observation") {
      const targetName = step === "wolf-day1-observation" ? "ミナト" : "スズ";
      return `<div class="action-card"><span class="private-role">PRIVATE RESULT</span><h3>${targetName}の合成演算</h3><p>計算結果の符号が出ました。市民と同じように結果を村に公開し、違和感を与えないようにしましょう。</p><div class="result-value">符号は－です</div><div class="action-buttons"><button class="primary-button highlight-btn" data-tut-wolf-pub="yes">符号を公開する</button><button class="secondary-button disabled-target">結果を伏せる</button></div></div>`;
    }
    if (step === "wolf-day1-discussion" || step === "wolf-day2-discussion") {
      const day1 = step === "wolf-day1-discussion";
      const chats = day1 ? `<div class="chat-message"><strong>アオイ:</strong> ミナトの符号がずっと噛み合わない気がします。</div><div class="chat-message"><strong>ユイ:</strong> 私もそう思います。ミナトが怪しいですね。</div><div class="chat-message"><strong>カイ:</strong> 投票しましょう。</div>` : `<div class="chat-message"><strong>アオイ:</strong> スズの報告が他の人と矛盾しています。</div><div class="chat-message"><strong>ミナト:</strong> スズが人狼っぽいですね…あなたはどう思いますか？</div><div class="chat-message"><strong>ユイ:</strong> 私もスズを疑っています。</div>`;
      const targetName = day1 ? "ミナト" : "スズ";
      const wolfNote = day1 ? "まだあなたは疑われていません。多数派に合わせて投票し、怪しまれないようにしましょう。" : "あなたも少し話題に上がりましたが、決定打はないようです。今のうちに多数派へ合わせましょう。";
      return `<div class="round-intro"><div class="panel-kicker">Shared observations</div><h2>符号の公開と議論</h2><div class="chat-container">${chats}</div><p style="color:#ffb74d;font-weight:bold">${wolfNote}</p><p style="color:#ff4d4d;font-weight:bold">${targetName}が怪しいようです。追放投票を行いましょう。</p></div><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-wolf-go-vote">追放投票へ</button></div>`;
    }
    if (step === "wolf-day1-vote" || step === "wolf-day2-vote") {
      const targetId = step === "wolf-day1-vote" ? "p3" : "p6";
      const targetName = step === "wolf-day1-vote" ? "ミナト" : "スズ";
      return `<div class="action-card"><span class="private-role">元の人狼</span><h3>あなたの投票</h3><p>正体を隠すため、多数派と同じ <b>${targetName}</b> に投票してください。</p><div class="target-grid function-targets">${alivePlayers.map((p) => `<button class="target-button ${p.id === targetId ? "highlight-btn" : "disabled-target"}" data-tut-wolf-vote="${p.id}">${p.name}</button>`).join("")}</div></div>`;
    }
    if (step === "wolf-day1-voteresult" || step === "wolf-day2-voteresult") {
      const day1 = step === "wolf-day1-voteresult";
      const targetName = day1 ? "ミナト" : "スズ";
      return `<div class="action-card"><span class="private-role">VOTE RESULT</span><h3>投票結果</h3><p>投票の結果、${targetName}が追放されました。彼(彼女)は「<b>市民</b>」でした。あなたは無事に切り抜けました。</p><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-wolf-go-night">夜の襲撃へ</button></div></div>`;
    }
    if (step === "wolf-day1-night-target" || step === "wolf-day2-night-target") {
      const targetId = step === "wolf-day1-night-target" ? "p4" : "p1";
      const targetName = step === "wolf-day1-night-target" ? "ユイ" : "アオイ";
      return `<div class="action-card"><span class="private-role">元の人狼</span><h3>襲撃対象を選ぶ</h3><p>まず襲う相手を選びます。関数の種類は分かりますが、誰がどの関数を持つかは分かりません。（チュートリアルでは <b>${targetName}</b> を選択します）</p><div class="target-grid function-targets">${alivePlayers.map((p) => `<button class="target-button ${p.id === targetId ? "highlight-btn" : "disabled-target"}" data-tut-wolf-attack-target="${p.id}">${p.name}<span class="function-mini">関数は非公開</span></button>`).join("")}</div></div>`;
    }
    if (step === "wolf-day1-night-guess" || step === "wolf-day2-night-guess") {
      const day1 = step === "wolf-day1-night-guess";
      const targetName = day1 ? "ユイ" : "アオイ";
      const correctId = day1 ? "fn-x2" : "fn-2x";
      return `<div class="action-card"><span class="private-role">元の人狼</span><h3>${targetName}の関数を推測</h3><p>この推測が的中した場合だけ、対象の関数にWが合成されます。（チュートリアルでは正解の選択肢を選びます）</p><div class="condition-box"><div class="condition-label">SELECTED TARGET</div><div class="condition-value">${targetName}</div></div><div class="target-grid function-targets">${WOLF_FUNCTION_OPTIONS.map((option) => `<button class="target-button ${option.id === correctId ? "highlight-btn" : "disabled-target"}" data-tut-wolf-attack-guess="${option.id}">${option.label}</button>`).join("")}</div></div>`;
    }
    if (step === "wolf-day1-nightresult") return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3><p>推測が的中し、ユイの関数にWが秘密裏に合成されました。本人にも他のプレイヤーにも気づかれません。</p><div class="result-value">Fᵢ′ = W ∘ Fᵢ（感染成功）</div><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-wolf-next-round">ROUND 2へ</button></div></div>`;
    if (step === "wolf-day2-nightresult") return `<div class="action-card"><span class="private-role">SECRET COMPOSITION</span><h3>夜が明けた</h3><p>推測が的中し、アオイの関数にもWが秘密裏に合成されました。人狼と感染した市民を合わせると、生存者の過半数に達しています。</p><div class="result-value">Fᵢ′ = W ∘ Fᵢ（感染成功）</div><div class="action-buttons"><button class="primary-button highlight-btn" id="tut-wolf-finish">結果を確認する</button></div></div>`;
    return "";
  }

  function tutorialMessageOverlay() {
    if (state.game.outcome) return "";
    const messages = {
      intro: "まずはルールを確認しましょう。確認できたら「調査を始める」ボタンを押してください。",
      "day1-investigate": "まずはミナトを調査してみましょう。光っているボタンを押してください。",
      "day1-observation": "結果が出ました。符号を村全体に公開しましょう。",
      "day1-discussion": "他のプレイヤーが議論を始めました。投票に進みましょう。",
      "day1-vote": "ミナトに追放投票をしましょう。",
      "day1-voteresult": "ミナトが追放されましたが、彼は市民でした。夜へ進みましょう。",
      "day2-nightresult": "夜が明けました。次のラウンドへ進みましょう。",
      "day2-investigate": "今度はレンを調査してみましょう。",
      "day2-observation": "結果が出ました。村に公開しましょう。",
      "day2-discussion": "議論の結果、レンが人狼であると判明したようです！",
      "day2-vote": "レンに投票して追放しましょう。",
      "day2-voteresult": "レンを追放しました！彼が人狼でした。",
      "wolf-intro": "人狼視点のルールを確認しましょう。確認できたら「調査を始める」ボタンを押してください。",
      "wolf-day1-investigate": "市民に紛れるため、まずはミナトを調査してみましょう。",
      "wolf-day1-observation": "結果が出ました。市民と同じように符号を公開しましょう。",
      "wolf-day1-discussion": "村の議論が進んでいます。多数派に合わせて投票へ進みましょう。",
      "wolf-day1-vote": "ミナトに投票して、多数派に合わせましょう。",
      "wolf-day1-voteresult": "ミナトが追放されました。あなたは疑われずに切り抜けました。夜の襲撃へ進みましょう。",
      "wolf-day1-night-target": "夜になりました。まずはユイを襲撃対象に選びましょう。",
      "wolf-day1-night-guess": "ユイの関数を推測します。正解の選択肢を選びましょう。",
      "wolf-day1-nightresult": "感染に成功しました！次のラウンドへ進みましょう。",
      "wolf-day2-investigate": "今度はスズを調査してみましょう。",
      "wolf-day2-observation": "結果が出ました。村に公開しましょう。",
      "wolf-day2-discussion": "少し疑われ始めていますが、まだ大丈夫です。多数派に合わせましょう。",
      "wolf-day2-vote": "スズに投票して、多数派に合わせましょう。",
      "wolf-day2-voteresult": "スズが追放されました。夜の襲撃へ進みましょう。",
      "wolf-day2-night-target": "2度目の夜です。アオイを襲撃対象に選びましょう。",
      "wolf-day2-night-guess": "アオイの関数を推測します。正解の選択肢を選びましょう。",
      "wolf-day2-nightresult": "2人目の感染に成功しました！結果を確認しましょう。",
    };
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
    document.querySelector("#tutorial-play-real")?.addEventListener("click", () => { state.tutorialMode = false; state.tutorialRole = null; state.game = null; state.room = null; state.error = null; render(); });
    document.querySelector("#tutorial-back-start")?.addEventListener("click", () => { state.tutorialMode = false; state.tutorialRole = null; state.game = null; state.room = null; state.error = null; render(); });

    // 人狼視点チュートリアルのイベント
    document.querySelector("#tut-wolf-start-investigation")?.addEventListener("click", () => { state.tutorialStep = "wolf-day1-investigate"; render(); });
    document.querySelectorAll("[data-tut-wolf-target]").forEach((b) => b.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "wolf-day1-investigate" ? "wolf-day1-observation" : "wolf-day2-observation"; render(); }));
    document.querySelectorAll("[data-tut-wolf-pub]").forEach((b) => b.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "wolf-day1-observation" ? "wolf-day1-discussion" : "wolf-day2-discussion"; render(); }));
    document.querySelector("#tut-wolf-go-vote")?.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "wolf-day1-discussion" ? "wolf-day1-vote" : "wolf-day2-vote"; render(); });
    document.querySelectorAll("[data-tut-wolf-vote]").forEach((b) => b.addEventListener("click", () => { const day1 = state.tutorialStep === "wolf-day1-vote"; state.game.players.find((p) => p.id === (day1 ? "p3" : "p6")).alive = false; state.tutorialStep = day1 ? "wolf-day1-voteresult" : "wolf-day2-voteresult"; render(); }));
    document.querySelector("#tut-wolf-go-night")?.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "wolf-day1-voteresult" ? "wolf-day1-night-target" : "wolf-day2-night-target"; render(); });
    document.querySelectorAll("[data-tut-wolf-attack-target]").forEach((b) => b.addEventListener("click", () => { state.tutorialStep = state.tutorialStep === "wolf-day1-night-target" ? "wolf-day1-night-guess" : "wolf-day2-night-guess"; render(); }));
    document.querySelectorAll("[data-tut-wolf-attack-guess]").forEach((b) => b.addEventListener("click", () => {
      const day1 = state.tutorialStep === "wolf-day1-night-guess";
      const targetId = day1 ? "p4" : "p1";
      state.game.players.find((p) => p.id === targetId).infected = true;
      state.tutorialStep = day1 ? "wolf-day1-nightresult" : "wolf-day2-nightresult";
      render();
    }));
    document.querySelector("#tut-wolf-next-round")?.addEventListener("click", () => { state.game.round = 2; state.tutorialStep = "wolf-day2-investigate"; render(); });
    document.querySelector("#tut-wolf-finish")?.addEventListener("click", () => { state.game.outcome = { winner: "wolf", reason: "元の人狼と、夜に感染した市民の合計が生存者の過半数に達した。" }; render(); });
  }

  return { startTutorialGame, tutorialStyle, tutorialBoard, tutorialMessageOverlay, tutorialOverlay, bindEvents };
}
