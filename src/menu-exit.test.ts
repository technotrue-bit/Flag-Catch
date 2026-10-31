/**
 * The title and select screens put the HUD in menu mode (the `fc-menu` class), which hides the stick, the
 * buttons, the score, the map and pause. A match started straight from a menu, without going through the select
 * screen's Play, has to leave menu mode itself, or it plays with no controls (Today's daily did, on iPhone).
 * main.ts needs WebGL, so this reads its source.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import mainSource from "./main.ts?raw";

function body(name: string): string {
  const src = ts.createSourceFile("main.ts", mainSource, ts.ScriptTarget.Latest, true);
  const fn = src.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  if (!fn?.body) throw new Error(`main.ts has no function ${name}`);
  return fn.body.getText(src);
}

describe("matches started from a menu", () => {
  it.each(["startDaily", "beginOnlineMatch"])("%s leaves menu mode so the controls show", (name) => {
    expect(body(name)).toContain('classList.remove("fc-menu")');
  });
});
