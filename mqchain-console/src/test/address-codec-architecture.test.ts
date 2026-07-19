import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const codecsRoot = join(root, "src", "lib", "mqchain", "address", "codecs");
const permittedBuiltins = new Set(["crypto", "node:crypto"]);

function codecFiles() {
  return readdirSync(codecsRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".ts"))
    .map(entry => join(codecsRoot, entry.name));
}

function moduleText(node: ts.Expression | undefined) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

describe("address codec architecture", () => {
  it("keeps codec implementations pure and statically linked", () => {
    const violations: string[] = [];

    for (const file of codecFiles()) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const label = relative(root, file);

      function inspect(node: ts.Node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const specifier = node.moduleSpecifier.text;
          if (specifier.startsWith(".")) {
            const dependency = resolve(file, "..", specifier);
            if (!dependency.startsWith(codecsRoot)) violations.push(`${label}: dependency escapes codec boundary ${specifier}`);
          } else if (!permittedBuiltins.has(specifier)) {
            violations.push(`${label}: forbidden dependency ${specifier}`);
          }
        }

        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
            violations.push(`${label}: require() is forbidden (${moduleText(node.arguments[0]) ?? "non-literal"})`);
          }
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            violations.push(`${label}: dynamic import() is forbidden (${moduleText(node.arguments[0]) ?? "non-literal"})`);
          }
        }

        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "process" && node.name.text === "env") {
          violations.push(`${label}: process.env is forbidden`);
        }
        if (
          ts.isElementAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "process" &&
          moduleText(node.argumentExpression) === "env"
        ) {
          violations.push(`${label}: process[\"env\"] is forbidden`);
        }

        ts.forEachChild(node, inspect);
      }

      inspect(source);
    }

    expect(codecFiles().length).toBe(10);
    expect(violations).toEqual([]);
  });
});
