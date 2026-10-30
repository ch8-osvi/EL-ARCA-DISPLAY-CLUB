const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../..");

/** Load real TypeScript modules with bounded dependency mocks, without a server. */
function loadSource(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  cache.set(filename, mod);
  const original = mod.require.bind(mod);
  mod.require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    const base = id.startsWith("@/")
      ? path.join(root, "src", id.slice(2))
      : id.startsWith(".")
        ? path.resolve(path.dirname(filename), id)
        : null;
    if (base)
      for (const suffix of [".ts", ".tsx"])
        if (fs.existsSync(base + suffix))
          return loadSource(base + suffix, mocks, cache);
    return original(id);
  };
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    filename,
  );
  return mod.exports;
}
module.exports = { loadSource };
