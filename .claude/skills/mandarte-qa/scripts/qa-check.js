#!/usr/bin/env node
/**
 * Mandarte Pre-Commit QA Scanner
 *
 * Catches the specific bug classes that have shipped in this project:
 * - Bracket imbalance (JSX rendering breaks)
 * - Band ID type coercion (.length on a number = undefined)
 * - Sex encoding direction (1=female, 2=male — we've swapped these)
 * - Missing min=0 on count inputs (negative egg counts happened)
 * - Syntax errors (malformed JSX)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '../../../../app/src/app');
const WARNINGS = [];
const ERRORS = [];

// Find all .js files under app/src/app/
function findJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findJsFiles(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

// Check 1: Bracket balance
function checkBrackets(file, code) {
  let parens = 0, braces = 0, brackets = 0;
  let lineNum = 0;
  for (const line of code.split('\n')) {
    lineNum++;
    for (const ch of line) {
      if (ch === '(') parens++;
      if (ch === ')') parens--;
      if (ch === '{') braces++;
      if (ch === '}') braces--;
      if (ch === '[') brackets++;
      if (ch === ']') brackets--;
    }
  }
  if (parens !== 0) ERRORS.push(`${rel(file)}: Unbalanced parentheses (off by ${parens})`);
  if (braces !== 0) ERRORS.push(`${rel(file)}: Unbalanced braces (off by ${braces})`);
  if (brackets !== 0) ERRORS.push(`${rel(file)}: Unbalanced brackets (off by ${brackets})`);
}

// Check 2: Syntax validation via babel (if available)
function checkSyntax(file, code) {
  try {
    // Try to use babel parser from @babel/parser (installed as dev dep)
    const { parse } = require('@babel/parser');
    parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      // Try without babel — just report bracket check covered it
      return;
    }
    const loc = e.loc ? ` (line ${e.loc.line})` : '';
    ERRORS.push(`${rel(file)}: Parse error${loc}: ${e.message.split('\n')[0]}`);
  }
}

// Check 3: Band ID type safety
// Flags patterns where .length is called on something that might be a DB integer
function checkBandTypeSafety(file, code) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Flag: kid1.length, kid2.length etc without prior String() conversion
    if (/\bkid\d\]?\)?\.length\b/.test(line) && !/String\(/.test(line)) {
      WARNINGS.push(`${rel(file)}:${i+1}: Possible .length on numeric kid field — wrap in String() first`);
    }
    // Flag: band_id.length without String conversion
    if (/band_id\)?\.length\b/.test(line) && !/String\(/.test(line)) {
      WARNINGS.push(`${rel(file)}:${i+1}: Possible .length on numeric band_id — wrap in String() first`);
    }
  }
}

// Check 4: Sex encoding direction
// Mandarte schema: sex=1 is female (♀), sex=2 is male (♂)
// The tricky part: ternaries like `sex === 2 ? '♂' : sex === 1 ? '♀' : '?'` are CORRECT
// but put both sex values on the same line as both symbols. We need to check the
// ternary structure, not just co-occurrence on a line.
function checkSexEncoding(file, code) {
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Pattern: sex === 1 ? '♂' (direct mapping of 1 to male — WRONG)
    if (/sex\s*===?\s*1\s*\?\s*['"`]♂/.test(line)) {
      WARNINGS.push(`${rel(file)}:${i+1}: sex=1 directly mapped to ♂ — but 1=FEMALE in this schema`);
    }
    // Pattern: sex === 2 ? '♀' (direct mapping of 2 to female — WRONG)
    if (/sex\s*===?\s*2\s*\?\s*['"`]♀/.test(line)) {
      WARNINGS.push(`${rel(file)}:${i+1}: sex=2 directly mapped to ♀ — but 2=MALE in this schema`);
    }
    // Pattern: sex === 1 near 'male' but not in a ternary fallback
    if (/sex\s*===?\s*1\s*\?\s*['"`]male['"`]/i.test(line)) {
      WARNINGS.push(`${rel(file)}:${i+1}: sex=1 mapped to 'male' — but 1=FEMALE in this schema`);
    }
    if (/sex\s*===?\s*2\s*\?\s*['"`]female['"`]/i.test(line)) {
      WARNINGS.push(`${rel(file)}:${i+1}: sex=2 mapped to 'female' — but 2=MALE in this schema`);
    }
  }
}

// Check 5: Missing min=0 on count inputs
function checkInputMins(file, code) {
  const lines = code.split('\n');
  const countFields = ['egg_count', 'chick_count', 'cowbird_eggs', 'cowbird_chicks', 'chick_age', 'eggs', 'hatch', 'band', 'fledge', 'indep'];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/type\s*=\s*["']number["']/.test(line) || /type=\{?"number"?\}?/.test(line)) {
      // Look at surrounding lines (±3) for min attribute
      const context = lines.slice(Math.max(0, i-3), Math.min(lines.length, i+4)).join(' ');
      const hasMin = /min\s*[=:{]/.test(context);
      const hasCountField = countFields.some(f => context.includes(f));
      if (hasCountField && !hasMin) {
        WARNINGS.push(`${rel(file)}:${i+1}: Number input for count field without min= attribute`);
      }
    }
  }
}

// Check 6: Schema/docs drift reminder
function checkDocsDrift() {
  try {
    const status = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only', {
      cwd: path.resolve(__dirname, '../../../..'),
      encoding: 'utf8'
    });
    const changedFiles = status.trim().split('\n').filter(Boolean);
    const appChanged = changedFiles.some(f => f.startsWith('app/'));
    const schemaChanged = changedFiles.some(f => f.includes('schema.sql'));
    const docsChanged = changedFiles.some(f => f.includes('database_spec'));

    if (appChanged && !schemaChanged) {
      WARNINGS.push('App code changed but schema.sql not updated — verify schema is still in sync');
    }
    if (appChanged && !docsChanged) {
      WARNINGS.push('App code changed but database_spec.md not updated — check if docs need updating');
    }
  } catch (e) {
    // Git not available, skip
  }
}

function rel(file) {
  return path.relative(path.resolve(__dirname, '../../../..'), file);
}

// Main
console.log('🔍 Mandarte Pre-Commit QA\n');

const files = findJsFiles(APP_DIR);
console.log(`Scanning ${files.length} files...\n`);

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  checkBrackets(file, code);
  checkSyntax(file, code);
  checkBandTypeSafety(file, code);
  checkSexEncoding(file, code);
  checkInputMins(file, code);
}

checkDocsDrift();

// Report
if (ERRORS.length > 0) {
  console.log(`❌ ERRORS (${ERRORS.length}):`);
  ERRORS.forEach(e => console.log(`  ${e}`));
  console.log();
}

if (WARNINGS.length > 0) {
  console.log(`⚠️  WARNINGS (${WARNINGS.length}):`);
  WARNINGS.forEach(w => console.log(`  ${w}`));
  console.log();
}

if (ERRORS.length === 0 && WARNINGS.length === 0) {
  console.log('✅ All checks passed\n');
}

console.log(`Summary: ${ERRORS.length} errors, ${WARNINGS.length} warnings`);
process.exit(ERRORS.length > 0 ? 1 : 0);
