/** ゲーム全体で共有する定数。ルール調整時はここを起点に変更できます。 */
export const INPUT_COUNT = 7;
export const PLAYER_COUNT = 7;
export const FUNCTION_NAMES = ["あなた", "アオイ", "レン", "ミナト", "ユイ", "カイ", "スズ"];

export const PHASES = Object.freeze({
  INVESTIGATION: "investigation",
  DISCUSSION: "discussion",
  VOTE: "vote",
  VOTE_RESULT: "vote-result",
  NIGHT: "night",
  NIGHT_RESULT: "night-result",
  ENDED: "ended",
});

