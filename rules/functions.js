import { INPUT_COUNT, PLAYER_COUNT } from "./constants.js";

export function shuffle(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function makeFunction(id, label, family, evaluate) {
  return { id, label, family, evaluate };
}

function signedCoefficient(value, variable = "") {
  const magnitude = Math.abs(value);
  const coefficient = magnitude === 1 && variable ? "" : magnitude;
  return `${value < 0 ? "−" : ""}${coefficient}${variable}`;
}

function appendSignedTerm(value, variable = "") {
  if (value === 0) return "";
  return ` ${value < 0 ? "−" : "+"} ${signedCoefficient(Math.abs(value), variable)}`;
}

export function functionSignature(fn) {
  return Array.from({ length: INPUT_COUNT }, (_, input) => fn.evaluate(input)).join(",");
}

export function makeFunctionLibrary() {
  const functions = [];
  for (const [a, b] of [[1, -6], [1, -2], [1, 1], [1, 5], [2, -8], [2, 1], [-1, 6], [-1, 2], [-2, 10], [-2, 3]]) {
    functions.push(makeFunction(`linear-${a}-${b}`, `f(x) = ${signedCoefficient(a, "x")}${appendSignedTerm(b)}`, "一次関数", (x) => a * x + b));
  }
  for (const [a, b, c] of [[1, 0, -8], [1, 1, -6], [1, -1, 4], [2, 0, -10], [2, 1, -5], [-1, 0, 8], [-1, 2, 3]]) {
    functions.push(makeFunction(`quadratic-${a}-${b}-${c}`, `f(x) = ${signedCoefficient(a, "x²")}${appendSignedTerm(b, "x")}${appendSignedTerm(c)}`, "二次関数", (x) => a * x * x + b * x + c));
  }
  for (const [a, b, c] of [[1, 1, -8], [2, -3, 2], [-1, 2, 6], [-2, 1, 5]]) {
    functions.push(makeFunction(`cubic-${a}-${b}-${c}`, `f(x) = ${signedCoefficient(a, "x³")}${appendSignedTerm(b, "x")}${appendSignedTerm(c)}`, "三次関数", (x) => a * x * x * x + b * x + c));
  }
  return functions;
}

export function makeCondition(_index, rng) {
  const input = Math.floor(rng() * INPUT_COUNT);
  return {
    input,
    label: `x = ${input} で合成値の符号を見る`,
    observe: (value) => {
      const key = value > 0 ? "positive" : value < 0 ? "negative" : "zero";
      const symbol = value > 0 ? "+" : value < 0 ? "−" : "0";
      return { key, symbol, display: `符号は${symbol}です。` };
    },
  };
}

export function buildBalancedFunctions(wolfIndex, rng) {
  const library = makeFunctionLibrary();
  let fallback = null;
  for (let attempt = 0; attempt < 6000; attempt += 1) {
    const wolfFunction = library[Math.floor(rng() * library.length)];
    const wolfSignature = functionSignature(wolfFunction);
    const uniqueCitizens = [];
    const seen = new Set([wolfSignature]);
    for (const candidate of shuffle(library, rng)) {
      const signature = functionSignature(candidate);
      if (seen.has(signature)) continue;
      seen.add(signature);
      uniqueCitizens.push(candidate);
    }
    const citizens = uniqueCitizens.slice(0, PLAYER_COUNT - 1);
    const functions = [];
    let citizenIndex = 0;
    for (let index = 0; index < PLAYER_COUNT; index += 1) {
      functions.push(index === wolfIndex ? wolfFunction : citizens[citizenIndex++]);
    }
    const conditions = Array.from({ length: PLAYER_COUNT }, (_, index) => makeCondition(index, rng));
    const matchSets = [];
    let balanced = new Set(functions.map((_, index) => index));
    for (let observerIndex = 0; observerIndex < PLAYER_COUNT; observerIndex += 1) {
      if (observerIndex === wolfIndex) continue;
      const ownFunction = functions[observerIndex];
      const condition = conditions[observerIndex];
      const wolfKey = condition.observe(ownFunction.evaluate(wolfFunction.evaluate(condition.input))).key;
      const matches = new Set();
      if (wolfKey === "zero") matches.clear();
      for (let targetIndex = 0; targetIndex < PLAYER_COUNT; targetIndex += 1) {
        if (targetIndex === observerIndex) continue;
        const result = ownFunction.evaluate(functions[targetIndex].evaluate(condition.input));
        if (condition.observe(result).key === wolfKey) matches.add(targetIndex);
      }
      matchSets.push(matches);
      balanced = new Set([...balanced].filter((candidate) => matches.has(candidate)));
    }
    const eachAmbiguous = matchSets.every((matches) => matches.has(wolfIndex) && matches.size >= 2 && matches.size <= 4);
    const familyCount = new Set(functions.map((fn) => fn.family)).size;
    if (eachAmbiguous && balanced.size === 1 && balanced.has(wolfIndex) && familyCount >= 3) {
      for (let observerIndex = 0; observerIndex < PLAYER_COUNT; observerIndex += 1) {
        const ownFunction = functions[observerIndex];
        const condition = conditions[observerIndex];
        condition.targetSign = condition.observe(ownFunction.evaluate(wolfFunction.evaluate(condition.input))).key;
      }
      fallback = { functions, conditions, wolfFunction };
      return fallback;
    }
  }
  return fallback;
}

