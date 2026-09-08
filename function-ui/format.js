export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function signText(sign) {
  return sign === "positive" ? "正" : sign === "negative" ? "負" : "零";
}

export function phaseLabel(phase) {
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

