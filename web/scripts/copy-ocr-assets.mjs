// Copies the OCR engine (tesseract.js) into public/ so screenshot annotation works without a CDN.
// Runs before dev and build; the copies are gitignored.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = path.join(import.meta.dirname, "..", "public", "vendor", "tesseract");
const pkg = (name) => path.dirname(require.resolve(`${name}/package.json`));
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (!fs.existsSync(to) || fs.statSync(to).size !== fs.statSync(from).size) fs.copyFileSync(from, to);
};

copy(path.join(pkg("tesseract.js"), "dist", "worker.min.js"), path.join(out, "worker.min.js"));
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"]) copy(path.join(pkg("tesseract.js-core"), f), path.join(out, "core", f));
copy(path.join(pkg("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"), path.join(out, "lang", "eng.traineddata.gz"));
console.log("OCR assets ready in public/vendor/tesseract");
