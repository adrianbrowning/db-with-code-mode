import { createLogger, defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import netlifyPlugin from '@netlify/vite-plugin-tanstack-start'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import rsc from '@vitejs/plugin-rsc'

// Packages that must never be bundled into the server output, because
// they depend on their on-disk layout at runtime (finding native
// binaries, .wasm siblings, or optional peer deps):
//   - esbuild: locates its native binary via a disk-relative path from
//     its own lib/main.js; bundling breaks the lookup.
//   - pg: pulls in optional native peers (pg-native) and other
//     runtime-resolved modules; Vite's dev module runner also chokes
//     on it if it isn't external.
//   - isolated-vm: native C++ addon (.node file) — can't be bundled.
//   - quickjs-emscripten (+ core + @jitl/quickjs-* variants): the
//     emscripten JS uses `new URL("emscripten-module.wasm",
//     import.meta.url)` to locate its sibling .wasm file. Bundling
//     the JS detaches it from the .wasm and blows up at runtime with
//     "ENOENT: emscripten-module.wasm".
// The top-level packages listed here are declared as direct
// dependencies in package.json so pnpm hoists them and Netlify's
// function packager (nft) traces and includes them along with their
// transitive @jitl/* variants (and their .wasm files).
// Silence noisy sourcemap warnings emitted by Vite's dev SSR module runner
// when third-party packages (e.g. google-auth-library, gaxios, gcp-metadata)
// ship `//# sourceMappingURL=...` comments but don't bundle the corresponding
// .map files (or ship .map files that point to missing original sources). The
// patterns below cover both code paths Vite uses to log this:
//   1. convert-source-map throws when the .map file is missing entirely:
//        "[vite] (ssr) Failed to load source map for ..."
//        "Error: An error occurred while trying to read the map file at ..."
//        "Error: ENOENT: no such file or directory, open '....map'"
//   2. Vite's own sourcemap loader logs when a found .map points elsewhere:
//        "Sourcemap for \"...\" points to missing source files"
// Other warnings still print normally.
const SOURCE_MAP_NOISE = [
  /Failed to load source map for/,
  /while trying to read the map file/,
  /no such file or directory.*\.map['"]?$/,
  /Sourcemap for .* points to missing source files/,
]
const isSourceMapNoise = (msg: unknown) =>
  typeof msg === 'string' && SOURCE_MAP_NOISE.some((p) => p.test(msg))

const quietLogger = createLogger()
const originalWarn = quietLogger.warn.bind(quietLogger)
const originalWarnOnce = quietLogger.warnOnce.bind(quietLogger)
const originalError = quietLogger.error.bind(quietLogger)
quietLogger.warn = (msg, options) => {
  if (isSourceMapNoise(msg)) return
  originalWarn(msg, options)
}
quietLogger.warnOnce = (msg, options) => {
  if (isSourceMapNoise(msg)) return
  originalWarnOnce(msg, options)
}
quietLogger.error = (msg, options) => {
  if (isSourceMapNoise(msg)) return
  originalError(msg, options)
}

const serverExternal = [
  'esbuild',
  'pg',
  'isolated-vm',
  'quickjs-emscripten',
  'quickjs-emscripten-core',
  '@jitl/quickjs-wasmfile-release-asyncify',
  '@jitl/quickjs-wasmfile-release-sync',
  '@jitl/quickjs-wasmfile-debug-asyncify',
  '@jitl/quickjs-wasmfile-debug-sync',
]

const config = defineConfig({
  customLogger: quietLogger,
  resolve: { tsconfigPaths: true },
  environments: {
    ssr: { resolve: { external: serverExternal } },
    rsc: { resolve: { external: serverExternal } },
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({ rsc: { enabled: true } }),
    rsc(),
    netlifyPlugin(),
    viteReact(),
  ],
})

export default config
