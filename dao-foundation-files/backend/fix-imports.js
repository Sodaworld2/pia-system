// Fix all module imports and type issues for TS compilation
const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, 'src', 'modules');
const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(modulesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix import paths: ../../../types/foundation -> ../types/foundation
  content = content.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/types\/foundation['"]/g,
    "from '../types/foundation'"
  );

  // Fix .where(function() { this... }) pattern - add type annotation
  content = content.replace(
    /\.where\(function\s*\(\)\s*\{/g,
    '.where(function (this: any) {'
  );

  // Fix .map callbacks that lack type annotations
  content = content.replace(
    /\.map\(\(row\)\s*=>/g,
    '.map((row: any) =>'
  );
  content = content.replace(
    /\.map\(\(k\)\s*=>/g,
    '.map((k: any) =>'
  );
  content = content.replace(
    /\.map\(\(g\)\s*=>/g,
    '.map((g: any) =>'
  );
  content = content.replace(
    /\.map\(\(s\)\s*=>/g,
    '.map((s: any) =>'
  );
  content = content.replace(
    /\.map\(\(p\)\s*=>/g,
    '.map((p: any) =>'
  );
  content = content.replace(
    /\.map\(\(t\)\s*=>/g,
    '.map((t: any) =>'
  );
  content = content.replace(
    /\.map\(\(c\)\s*=>/g,
    '.map((c: any) =>'
  );
  content = content.replace(
    /\.map\(\(d\)\s*=>/g,
    '.map((d: any) =>'
  );
  content = content.replace(
    /\.map\(\(m\)\s*=>/g,
    '.map((m: any) =>'
  );
  content = content.replace(
    /\.map\(\(e\)\s*=>/g,
    '.map((e: any) =>'
  );
  content = content.replace(
    /\.map\(\(item\)\s*=>/g,
    '.map((item: any) =>'
  );
  content = content.replace(
    /\.filter\(\(item\)\s*=>/g,
    '.filter((item: any) =>'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed: ${file}`);
}

console.log('All imports and type annotations fixed.');
