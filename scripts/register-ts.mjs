/** Registers the extensionless-import resolver. Used via `node --import`. */
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
