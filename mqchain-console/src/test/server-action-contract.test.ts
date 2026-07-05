import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ACTION_EXPORT_PATTERN = /export async function ([A-Za-z0-9_]+)\b/g;

function actionBlocks(source: string) {
  const matches = [...source.matchAll(ACTION_EXPORT_PATTERN)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    return {
      name: match[1],
      body: source.slice(match.index ?? 0, next?.index ?? source.length),
    };
  });
}

describe("MQCHAIN server action contract", () => {
  const actionSource = readFileSync(join(process.cwd(), "src", "app", "mqchain", "actions.ts"), "utf8");
  const actions = actionBlocks(actionSource);

  it("keeps MQCHAIN mutations in a server-action module", () => {
    expect(actionSource.startsWith('"use server";')).toBe(true);
    expect(actions.length).toBeGreaterThan(70);
  });

  it("wraps inline result actions in structured ActionResult handling and revalidates affected views", () => {
    const violations = actions
      .filter((action) => action.name.endsWith("ResultAction"))
      .filter((action) => !action.body.includes("return runAction(async () =>") || !action.body.includes("revalidate"));

    expect(violations.map((action) => action.name)).toEqual([]);
  });

  it("revalidates cache paths before redirecting legacy form actions", () => {
    const violations = actions
      .filter((action) => action.name.endsWith("Action") && !action.name.endsWith("ResultAction"))
      .filter((action) => !action.body.includes("redirect(") || !action.body.includes("revalidate"));

    expect(violations.map((action) => action.name)).toEqual([]);
  });
});
