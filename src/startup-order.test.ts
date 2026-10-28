/**
 * main.ts runs top to bottom when the page loads, and some of its lines call
 * functions straight away (the first newMatch, buildWorld...). If such a call
 * reads a `let` or `const` that is only declared further down, the browser
 * throws "Cannot access ... before initialization" and the game never starts.
 * The sim tests can't see that, so this reads main.ts and checks the order.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import mainSource from "./main.ts?raw";

/** Top-level `let`/`const` read by code that runs before the line declaring them. */
function earlyReads(file: string, text: string): string[] {
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const statements = src.statements;
  const declaredAt = new Map<string, number>();
  const functions = new Map<string, ts.FunctionDeclaration>();
  statements.forEach((s, i) => {
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) declaredAt.set(d.name.text, i);
    } else if (ts.isClassDeclaration(s) && s.name) declaredAt.set(s.name.text, i);
    else if (ts.isFunctionDeclaration(s) && s.name) functions.set(s.name.text, s);
  });

  /** Identifiers that only name something (a property, a key, a new local) and read nothing. */
  function isNameOnly(n: ts.Identifier): boolean {
    const p = n.parent;
    return (
      (ts.isPropertyAccessExpression(p) && p.name === n) ||
      (ts.isPropertyAssignment(p) && p.name === n) ||
      (ts.isMethodDeclaration(p) && p.name === n) ||
      (ts.isPropertyDeclaration(p) && p.name === n) ||
      (ts.isPropertySignature(p) && p.name === n) ||
      (ts.isBindingElement(p) && p.propertyName === n) ||
      ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p)) && p.name === n) ||
      ts.isTypeReferenceNode(p) ||
      ts.isQualifiedName(p)
    );
  }

  /** Parameters and variables declared inside a function. */
  function localNames(fn: ts.Node): Set<string> {
    const out = new Set<string>();
    const visit = (n: ts.Node): void => {
      if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name)) out.add(n.name.text);
      ts.forEachChild(n, visit);
    };
    visit(fn);
    return out;
  }

  // What a piece of code reads as it runs: names it touches and top-level functions it calls,
  // leaving out functions it only defines (callbacks run later).
  function reads(node: ts.Node, names: Set<string>, calls: Set<string>, inFunction = false): void {
    const found = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (n !== node && (ts.isFunctionLike(n) || ts.isClassLike(n))) {
        // An arrow called on the spot still runs now.
        const parent = n.parent;
        const iife = parent && ts.isCallExpression(parent) && parent.expression === n;
        const wrapped = parent && ts.isParenthesizedExpression(parent) && ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
        if (!iife && !wrapped) return;
      }
      if (ts.isIdentifier(n) && !isNameOnly(n)) {
        found.add(n.text);
        if (functions.has(n.text) && ts.isCallExpression(n.parent) && n.parent.expression === n) calls.add(n.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    // A function's own parameters and locals shadow the top-level names.
    if (inFunction) for (const local of localNames(node)) found.delete(local);
    for (const name of found) names.add(name);
  }

  const problems: string[] = [];
  statements.forEach((s, i) => {
    if (ts.isFunctionDeclaration(s)) return;
    const names = new Set<string>();
    const calls = new Set<string>();
    reads(s, names, calls);
    const seen = new Set<string>();
    const queue = [...calls];
    while (queue.length) {
      const f = queue.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      const more = new Set<string>();
      reads(functions.get(f)!, names, more, true);
      for (const m of more) queue.push(m);
    }
    for (const name of names) {
      const at = declaredAt.get(name);
      if (at !== undefined && at > i) problems.push(`line ${src.getLineAndCharacterOfPosition(s.getStart()).line + 1} reads ${name} before it is declared`);
    }
  });
  return problems;
}

describe("start-up order", () => {
  it("main.ts never reads a variable before the line that declares it", () => {
    expect(earlyReads("main.ts", mainSource)).toEqual([]);
  });
});
