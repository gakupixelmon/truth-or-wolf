/** ゲーム全体で共有する定数。ルール調整時はここを起点に変更できます。 */
export const INPUT_COUNT = 7;
export const DEFAULT_PLAYER_COUNT = 7;
export const MIN_PLAYER_COUNT = 4;
export const MAX_PLAYER_COUNT = 12;
// 既存コードとの互換性を保つための既定値エイリアス。
export const PLAYER_COUNT = DEFAULT_PLAYER_COUNT;
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
