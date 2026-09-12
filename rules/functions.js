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
  for (const [a, b] of [[1, -6], [1, -2], [1, 0], [1, 1], [1, 5], [2, -8], [2, 1], [-1, 6], [-1, 2], [-2, 10], [-2, 3]]) {
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

export function buildBalancedFunctions(wolfIndices, rng, playerCount = PLAYER_COUNT, { includeIdentityFunction = true, identityPlayerIndex = null } = {}) {
  const library = makeFunctionLibrary();
  if (playerCount < 2 || playerCount > library.length) {
    throw new Error(`Unsupported player count: ${playerCount}`);
  }
  const wolfIndexList = Array.isArray(wolfIndices) ? wolfIndices : [wolfIndices];
  const wolfSet = new Set(wolfIndexList);
  if (wolfSet.size !== wolfIndexList.length || wolfSet.size < 1 || wolfSet.size >= playerCount || [...wolfSet].some((index) => index < 0 || index >= playerCount)) {
    throw new Error(`Invalid wolf indices for ${playerCount} players`);
  }
  let fallback = null;
  for (let attempt = 0; attempt < 6000; attempt += 1) {
    const identityFunction = library.find((candidate) => candidate.id === "linear-1-0");
    const availableLibrary = includeIdentityFunction
      ? library
      : library.filter((candidate) => candidate.id !== identityFunction.id);
    const wolfCandidates = availableLibrary.filter((candidate) => !includeIdentityFunction || candidate.id !== identityFunction.id);
    const wolfFunction = wolfCandidates[Math.floor(rng() * wolfCandidates.length)];
    const wolfSignature = functionSignature(wolfFunction);
    const uniqueCitizens = [];
    const seen = new Set([wolfSignature]);
    for (const candidate of shuffle(availableLibrary, rng)) {
      const signature = functionSignature(candidate);
      if (seen.has(signature)) continue;
      seen.add(signature);
      uniqueCitizens.push(candidate);
    }
    const citizenCount = playerCount - wolfSet.size;
    const otherCitizens = uniqueCitizens.filter((candidate) => !includeIdentityFunction || candidate.id !== identityFunction.id);
    const citizens = includeIdentityFunction
      ? shuffle([identityFunction, ...otherCitizens.slice(0, citizenCount - 1)], rng)
      : shuffle(otherCitizens.slice(0, citizenCount), rng);
    const functions = [];
    let citizenIndex = 0;
    for (let index = 0; index < playerCount; index += 1) {
      functions.push(wolfSet.has(index) ? wolfFunction : citizens[citizenIndex++]);
    }
    if (includeIdentityFunction && Number.isInteger(identityPlayerIndex) && identityPlayerIndex >= 0 && identityPlayerIndex < playerCount && !wolfSet.has(identityPlayerIndex)) {
      const identityIndex = functions.findIndex((candidate) => candidate.id === identityFunction.id);
      if (identityIndex >= 0 && identityIndex !== identityPlayerIndex) {
        [functions[identityIndex], functions[identityPlayerIndex]] = [functions[identityPlayerIndex], functions[identityIndex]];
      }
    }
    const conditions = Array.from({ length: playerCount }, (_, index) => makeCondition(index, rng));
    const matchSets = [];
    let balanced = new Set(functions.map((_, index) => index));
    for (let observerIndex = 0; observerIndex < playerCount; observerIndex += 1) {
      if (wolfSet.has(observerIndex)) continue;
      const ownFunction = functions[observerIndex];
      const condition = conditions[observerIndex];
      const wolfKey = condition.observe(ownFunction.evaluate(wolfFunction.evaluate(condition.input))).key;
      const matches = new Set();
      if (wolfKey === "zero") matches.clear();
      for (let targetIndex = 0; targetIndex < playerCount; targetIndex += 1) {
        if (targetIndex === observerIndex) continue;
        const result = ownFunction.evaluate(functions[targetIndex].evaluate(condition.input));
        if (condition.observe(result).key === wolfKey) matches.add(targetIndex);
      }
      matchSets.push(matches);
      balanced = new Set([...balanced].filter((candidate) => matches.has(candidate)));
    }
    const maxAmbiguousCandidates = playerCount <= 7 ? 4 : Math.max(4, Math.ceil(playerCount * 0.6));
    const eachAmbiguous = matchSets.every((matches) => [...wolfSet].every((index) => matches.has(index)) && matches.size >= wolfSet.size + 1 && matches.size <= maxAmbiguousCandidates);
    const familyCount = new Set(functions.map((fn) => fn.family)).size;
    if (eachAmbiguous && balanced.size === wolfSet.size && [...wolfSet].every((index) => balanced.has(index)) && familyCount >= 3) {
      for (let observerIndex = 0; observerIndex < playerCount; observerIndex += 1) {
        const ownFunction = functions[observerIndex];
        const condition = conditions[observerIndex];
        condition.targetSign = condition.observe(ownFunction.evaluate(wolfFunction.evaluate(condition.input))).key;
      }
      fallback = { functions, conditions, wolfFunction, wolfIndices: [...wolfSet] };
      return fallback;
    }
  }
  return fallback;
}
