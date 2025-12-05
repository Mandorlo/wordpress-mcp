/**
 * Copy non-TypeScript assets from src/ to dist/
 * 
 * This script copies:
 * - SKILL.md files from src/skills/ to dist/skills/
 * - PHP templates from src/skills/ to dist/skills/
 */

import { readdirSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

/**
 * Recursively copy files matching a filter from src to dest
 */
function copyFilesRecursive(src, dest, filter) {
  if (!existsSync(src)) {
    console.log(`  Skipping ${src} (does not exist)`);
    return;
  }

  const entries = readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyFilesRecursive(srcPath, destPath, filter);
    } else if (filter(entry.name)) {
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
      console.log(`  Copied: ${srcPath} → ${destPath}`);
    }
  }
}

// Main
console.log('Copying assets to dist/...\n');

// Copy SKILL.md files from skills directories
console.log('Skills (*.md files):');
copyFilesRecursive(
  join(ROOT_DIR, 'src', 'skills'),
  join(ROOT_DIR, 'dist', 'skills'),
  (filename) => filename.endsWith('.md')
);

// Copy PHP template files from skills directories
console.log('\nPHP templates (*.php files):');
copyFilesRecursive(
  join(ROOT_DIR, 'src', 'skills'),
  join(ROOT_DIR, 'dist', 'skills'),
  (filename) => filename.endsWith('.php')
);

console.log('\nDone!');
