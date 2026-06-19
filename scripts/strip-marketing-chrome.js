const fs = require("fs");
const path = require("path");

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (/\.(tsx|jsx)$/.test(f)) files.push(p);
  }
  return files;
}

const root = path.join(__dirname, "../src/app/(marketing)");
for (const file of walk(root)) {
  let c = fs.readFileSync(file, "utf8");
  const orig = c;
  c = c.replace(/^import Header from .*\n/gm, "");
  c = c.replace(/^import Footer from .*\n/gm, "");
  c = c.replace(/^import FloatingSupport from .*\n/gm, "");
  c = c.replace(/\s*<Header \/>\n?/g, "");
  c = c.replace(/\s*<Footer \/>\n?/g, "");
  c = c.replace(/\s*<FloatingSupport \/>\n?/g, "");
  c = c.replace(/\{\/\* <Header \/> \*\/\}\n?/g, "");
  c = c.replace(/className="min-h-screen bg-background"/g, 'className="premium-page"');
  c = c.replace(/className='min-h-screen bg-background'/g, "className='premium-page'");
  if (c !== orig) {
    fs.writeFileSync(file, c);
    console.log("updated", file);
  }
}
