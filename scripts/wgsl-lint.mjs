/**
 * Catches WGSL reserved words used as identifiers inside /* wgsl *​/ template
 * literals, before the shader reaches a browser.
 *
 * This is a lint, not a validator — it will not catch type errors or bad
 * bindings, only the specific footgun of naming a variable something WGSL has
 * claimed. Worth having because the failure mode is a runtime shader-compile
 * error that only appears on page load, and this project hand-writes a lot of
 * WGSL. ('self' cost us one reload; hence this file.)
 *
 * Usage: node scripts/wgsl-lint.mjs <files...>   (or `npm run lint:wgsl`)
 */

import { readFileSync } from 'node:fs';

// WGSL spec §2.3 reserved words.
const RESERVED = new Set(`NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become binding_array cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename union unless unorm unsafe unsized use using varying virtual volatile wgsl where while writeonly yield`.split(/\s+/));

const files = process.argv.slice(2);
let bad = 0;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // Only look inside /* wgsl */ template literals.
  for (const m of src.matchAll(/\/\* wgsl \*\/\s*`([\s\S]*?)`/g)) {
    const body = m[1];
    const offset = m.index;
    // Declaration sites: let/var/const/fn names and function params.
    for (const d of body.matchAll(/\b(?:let|var|const|fn)\s+(?:<[^>]*>\s*)?([A-Za-z_]\w*)/g)) {
      if (RESERVED.has(d[1])) {
        const line = src.slice(0, offset).split('\n').length + body.slice(0, d.index).split('\n').length - 1;
        console.log(`${f}:${line}  reserved identifier declared: '${d[1]}'`);
        bad++;
      }
    }
    for (const d of body.matchAll(/([A-Za-z_]\w*)\s*:\s*(?:vec|mat|f32|u32|i32|bool|array|ptr|atomic)/g)) {
      if (RESERVED.has(d[1])) {
        const line = src.slice(0, offset).split('\n').length + body.slice(0, d.index).split('\n').length - 1;
        console.log(`${f}:${line}  reserved identifier as param/member: '${d[1]}'`);
        bad++;
      }
    }
  }
}

console.log(bad === 0 ? 'OK — no reserved words used as identifiers' : `${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
