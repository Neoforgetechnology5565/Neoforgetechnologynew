// Test-only preload: lets server-only modules be imported by unit tests. Usage: tsx --require ./scripts/stub-server-only.cjs file.test.tsx
const p = require.resolve("server-only"); require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
const c = require.resolve("next/cache"); require.cache[c] = { id: c, filename: c, loaded: true, exports: { unstable_cache: (fn) => fn, revalidateTag() {}, revalidatePath() {} } };
globalThis.React = require("react"); // tsx uses the classic JSX transform; Next uses the automatic one
