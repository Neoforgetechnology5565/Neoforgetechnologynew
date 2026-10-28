#!/usr/bin/env node
/** Copies the ONNX Runtime Web WebAssembly binary into public/ so the browser engine of the vehicle demo is served from our own origin (no CDN). */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
const src = "node_modules/onnxruntime-web/dist", dst = "public/vehicle/ort";
if (!existsSync(src)) { console.log("onnxruntime-web not installed; skipping wasm copy"); process.exit(0); }
mkdirSync(dst, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(`${src}/${f}`, `${dst}/${f}`);
console.log("copied onnxruntime-web wasm to", dst);
