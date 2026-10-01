//Builds dist/index.html: the whole app in one file, so it can be hosted
//anywhere a single HTML page can go. Each module becomes a block that
//returns its exports, and imports become destructuring from those blocks.
//The Web Worker's code is embedded in a <script type="text/plain"> tag and
//started from a Blob (app.js looks for the "worker-source" element).
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = name => readFileSync(join(here, name), "utf8");

//Turns an ES module into "const __m_name = (() => { ...; return {exports}; })();"
function moduleBlock(name){
    let code = read(name + ".js");
    const exports = [];
    //import {a, b} from "./x.js";  ->  const {a, b} = __m_x;
    code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*"\.\/(\w+)\.js";\s*$/gm, (m, names, mod) => `const {${names}} = __m_${mod};`);
    //export function/class/const/let name  ->  function/class/const/let name
    code = code.replace(/^export\s+(function|class|const|let)\s+(\w+)/gm, (m, kind, id) => { exports.push(id); return `${kind} ${id}`; });
    //export {a, b};
    code = code.replace(/^export\s*\{([^}]*)\};\s*$/gm, (m, names) => { names.split(",").map(s => s.trim()).filter(Boolean).forEach(n => exports.push(n)); return ""; });
    if(/^(import|export)\b/m.test(code)) throw new Error(`unhandled import/export in ${name}.js`);
    return `const __m_${name} = (() => {\n${code}\nreturn {${[...new Set(exports)].join(", ")}};\n})();\n`;
}

const appModules = ["solver", "geometry", "render", "vision", "cube3d", "app"];
const appCode = appModules.map(moduleBlock).join("\n");

//The worker is a classic script: solver module block plus the worker body.
let workerBody = read("worker.js").replace(/^import\s*\{([^}]*)\}\s*from\s*"\.\/(\w+)\.js";\s*$/gm, (m, names, mod) => `const {${names}} = __m_${mod};`);
const workerCode = moduleBlock("solver") + "\n" + workerBody;
if(/<\/script/i.test(workerCode)) throw new Error("worker code contains </script>");

let html = read("index.html");
html = html.replace('<script type="module" src="app.js"></script>',
    `<script type="text/plain" id="worker-source">\n${workerCode}\n</script>\n<script type="module">\n${appCode}\n</script>`);
mkdirSync(join(here, "dist"), {recursive: true});
writeFileSync(join(here, "dist", "index.html"), html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
