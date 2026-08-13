import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const rootDir = path.resolve();
const staticDir = path.join(rootDir, 'static');
const websiteAppDir = path.join(rootDir, 'website', 'app');

console.log('1. Compiling React app...');
execSync('npm run build', { stdio: 'inherit' });

console.log('2. Preparing website/app directory...');
if (fs.existsSync(websiteAppDir)) {
  fs.rmSync(websiteAppDir, { recursive: true, force: true });
}
fs.mkdirSync(websiteAppDir, { recursive: true });

console.log('3. Copying compiled static files to website/app...');
function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(staticDir, websiteAppDir);
console.log('Success! The React app has been copied into website/app.');
console.log('To deploy to GitHub Pages, run: npx gh-pages -d website');
