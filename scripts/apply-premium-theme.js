const fs = require("fs");
const path = require("path");

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (/\.(tsx|jsx|ts|js)$/.test(f)) files.push(p);
  }
  return files;
}

const replacements = [
  [/import Header from .*\n/g, ""],
  [/import Footer from .*\n/g, ""],
  [/import FloatingSupport from .*\n/g, ""],
  [/\s*<Header \/>\n?/g, ""],
  [/\s*<Footer \/>\n?/g, ""],
  [/\s*<FloatingSupport \/>\n?/g, ""],
  [/className="section-padding gradient- bg-background[^"]*"/g, 'className="hero-premium-bg section-padding relative overflow-hidden"'],
  [/className="section-padding gradient-bg[^"]*"/g, 'className="hero-premium-bg section-padding relative overflow-hidden"'],
  [/className="section-padding gradient- relative overflow-hidden"/g, 'className="hero-premium-bg section-padding relative overflow-hidden"'],
  [/className="section-padding bg-background - relative overflow-hidden"/g, 'className="hero-premium-bg section-padding relative overflow-hidden"'],
  [/className="py-16 bg-background[^"]*"/g, 'className="premium-page-section"'],
  [/className="py-20 bg-background[^"]*"/g, 'className="premium-page-section"'],
  [/className="p-12 bg-background"/g, 'className="premium-page-section"'],
  [/className="bg-gradient-to-br from-primary\/10 to-secondary\/10 py-16"/g, 'className="premium-page-section premium-page-section--alt"'],
  [/className="min-h-screen bg-background text-foreground"/g, 'className="premium-page"'],
  [/className="flex flex-col items-center bg-background justify-center min-h-screen"/g, 'className="flex flex-col items-center premium-page justify-center min-h-[70vh]"'],
];

const root = path.join(__dirname, "../src/app/(marketing)");
for (const file of walk(root)) {
  let c = fs.readFileSync(file, "utf8");
  const orig = c;
  for (const [re, rep] of replacements) c = c.replace(re, rep);
  if (c !== orig) {
    fs.writeFileSync(file, c);
    console.log("updated", path.relative(root, file));
  }
}

// Also update auth components
const authFiles = [
  path.join(__dirname, "../src/components/component/LoginPage.tsx"),
  path.join(__dirname, "../src/components/component/GetStartedPage.tsx"),
];
for (const file of authFiles) {
  if (!fs.existsSync(file)) continue;
  let c = fs.readFileSync(file, "utf8");
  const orig = c;
  c = c.replace(/src='\/bg\.gif'[\s\S]*?<\/div>\s*\n\s*<div className="absolute inset-0 bg-gradient[^"]*"[^>]*><\/div>\s*\n\s*<\/div>/g, "");
  if (c !== orig) {
    fs.writeFileSync(file, c);
    console.log("updated auth", path.basename(file));
  }
}
