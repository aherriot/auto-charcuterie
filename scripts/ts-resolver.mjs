/**
 * Node ESM resolve hook that maps extensionless relative imports onto `.ts`.
 *
 * Application code uses extensionless imports, which Turbopack resolves but
 * Node's ESM loader does not. Rather than litter the engine with `.ts`
 * extensions to satisfy a dev script, this teaches Node the same convention so
 * `scripts/*.mts` can import engine modules directly.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CANDIDATES = [".ts", ".mts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !path.extname(specifier)) {
    const parent = context.parentURL
      ? path.dirname(fileURLToPath(context.parentURL))
      : process.cwd();
    const base = path.resolve(parent, specifier);

    for (const ext of CANDIDATES) {
      const candidate = base + ext;
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
