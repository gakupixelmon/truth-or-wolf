export const ROLES = ["wolf", "seer", "guardian", "citizen"];

export const ROLE_META = {
  wolf: { symbol: "W", label: "人狼" },
  seer: { symbol: "S", label: "占い師" },
  guardian: { symbol: "G", label: "狩人" },
  citizen: { symbol: "C", label: "市民", predicateLabel: "市民陣営" },
};

export const atom = (role, playerId) => ({ type: "atom", role, playerId });
export const not = (value) => ({ type: "not", value });
export const binary = (type, left, right) => ({ type, left, right });

export function atomKey(value) {
  return `${value.role}:${value.playerId}`;
}

export function formatFormula(formula, players, compact = false) {
  const nameOf = (id) => players.find((player) => player.id === id)?.name ?? id;
  const visit = (node, nested = false) => {
    if (node.type === "atom") {
      const name = compact ? nameOf(node.playerId).slice(0, 2) : nameOf(node.playerId);
      return `${ROLE_META[node.role].symbol}(${name})`;
    }
    if (node.type === "not") {
      const inner = visit(node.value, true);
      return `¬${node.value.type === "atom" ? inner : `(${inner})`}`;
    }
    const symbols = { and: "∧", or: "∨", implies: "→", iff: "↔" };
    const text = `${visit(node.left, true)} ${symbols[node.type]} ${visit(node.right, true)}`;
    return nested ? `(${text})` : text;
  };
  return visit(formula);
}

export function explainFormula(formula, players) {
  const nameOf = (id) => players.find((player) => player.id === id)?.name ?? id;
  const atomText = (node) => {
    const label = ROLE_META[node.role].predicateLabel ?? ROLE_META[node.role].label;
    return `${nameOf(node.playerId)}は${label}である`;
  };
  const visit = (node) => {
    if (node.type === "atom") return atomText(node);
    if (node.type === "not") return `${visit(node.value)}、ということはない`;
    const left = visit(node.left);
    const right = visit(node.right);
    if (node.type === "and") return `${left}、かつ、${right}`;
    if (node.type === "or") return `${left}、または、${right}`;
    if (node.type === "implies") return `もし「${left}」ならば「${right}」`;
    return `「${left}」と「${right}」は同値である`;
  };
  return visit(formula);
}

class CnfBuilder {
  constructor(players) {
    this.nextId = 1;
    this.ids = new Map();
    this.clauses = [];
    for (const player of players) {
      for (const role of ROLES) this.variable(`${role}:${player.id}`);
    }
  }

  variable(key) {
    if (!this.ids.has(key)) this.ids.set(key, this.nextId++);
    return this.ids.get(key);
  }

  encode(node) {
    if (node.type === "atom") return this.variable(atomKey(node));
    if (node.type === "not") {
      const child = this.encode(node.value);
      const result = this.variable(`t:${this.nextId}:not`);
      this.clauses.push([-result, -child], [result, child]);
      return result;
    }

    const left = this.encode(node.left);
    const right = this.encode(node.right);
    const result = this.variable(`t:${this.nextId}:${node.type}`);
    if (node.type === "and") {
      this.clauses.push([-result, left], [-result, right], [result, -left, -right]);
    } else if (node.type === "or") {
      this.clauses.push([-left, result], [-right, result], [-result, left, right]);
    } else if (node.type === "implies") {
      this.clauses.push([-result, -left, right], [result, left], [result, -right]);
    } else if (node.type === "iff") {
      this.clauses.push(
        [-result, -left, right],
        [-result, left, -right],
        [result, left, right],
        [result, -left, -right],
      );
    }
    return result;
  }
}

function addGameRules(builder, players) {
  // C(x) is an alignment predicate: citizen, seer and guardian all satisfy it.
  // A separate hidden variable represents the ordinary citizen occupation.
  for (const player of players) {
    const wolf = builder.variable(`wolf:${player.id}`);
    const citizenSide = builder.variable(`citizen:${player.id}`);
    builder.clauses.push([-citizenSide, -wolf], [citizenSide, wolf]);

    const roleVariables = [
      wolf,
      builder.variable(`seer:${player.id}`),
      builder.variable(`guardian:${player.id}`),
      builder.variable(`plainCitizen:${player.id}`),
    ];
    builder.clauses.push(roleVariables);
    for (let i = 0; i < roleVariables.length; i += 1) {
      for (let j = i + 1; j < roleVariables.length; j += 1) {
        builder.clauses.push([-roleVariables[i], -roleVariables[j]]);
      }
    }
  }

  // The seven-player setup has exactly one wolf, seer and guardian.
  for (const role of ["wolf", "seer", "guardian"]) {
    const variables = players.map((player) => builder.variable(`${role}:${player.id}`));
    builder.clauses.push(variables);
    for (let i = 0; i < variables.length; i += 1) {
      for (let j = i + 1; j < variables.length; j += 1) {
        builder.clauses.push([-variables[i], -variables[j]]);
      }
    }
  }
}

function simplify(clauses, literal) {
  const simplified = [];
  for (const clause of clauses) {
    if (clause.includes(literal)) continue;
    const next = clause.filter((item) => item !== -literal);
    if (next.length === 0) return null;
    simplified.push(next);
  }
  return simplified;
}

function solve(clauses) {
  let current = clauses;
  while (true) {
    if (current.length === 0) return true;
    if (current.some((clause) => clause.length === 0)) return false;
    const unit = current.find((clause) => clause.length === 1);
    if (!unit) break;
    current = simplify(current, unit[0]);
    if (current === null) return false;
  }

  const counts = new Map();
  for (const clause of current) {
    for (const literal of clause) {
      const variable = Math.abs(literal);
      counts.set(variable, (counts.get(variable) ?? 0) + 1);
    }
  }
  const variable = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const positive = simplify(current, variable);
  if (positive !== null && solve(positive)) return true;
  const negative = simplify(current, -variable);
  return negative !== null && solve(negative);
}

export function isConsistent(players, formulas, publicFacts = []) {
  const builder = new CnfBuilder(players);
  addGameRules(builder, players);
  for (const formula of [...publicFacts, ...formulas]) {
    const variable = builder.encode(formula);
    builder.clauses.push([variable]);
  }
  return solve(builder.clauses);
}

export function checkNewStatement(players, history, candidate, publicFacts = []) {
  if (isConsistent(players, [...history, candidate], publicFacts)) {
    return { consistent: true, conflictIndexes: [] };
  }

  let core = history.map((_, index) => index);
  for (const index of [...core]) {
    const trial = core
      .filter((item) => item !== index)
      .map((item) => history[item]);
    if (!isConsistent(players, [...trial, candidate], publicFacts)) {
      core = core.filter((item) => item !== index);
    }
  }
  return { consistent: false, conflictIndexes: core };
}
