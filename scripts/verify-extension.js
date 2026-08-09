'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const packagePath = path.join(root, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

function fail(message) {
  console.error(`Security verification failed: ${message}`);
  process.exitCode = 1;
}

if (manifest.manifest_version !== 3) fail('manifest_version must remain 3');
if (manifest.version !== packageJson.version) fail('manifest and package versions must match');

const permissions = new Set(manifest.permissions || []);
for (const permission of permissions) {
  if (permission !== 'storage') fail(`unexpected privileged permission: ${permission}`);
}

const extensionCsp = manifest.content_security_policy?.extension_pages || '';
if (!extensionCsp.includes("script-src 'self'")) fail('extension pages must use a self-only script policy');
if (/unsafe-eval|unsafe-inline|https?:/i.test(extensionCsp)) fail('extension CSP contains an unsafe script source');
if ((manifest.externally_connectable?.matches || []).length > 0) fail('externally_connectable requires a dedicated security review');

const referencedFiles = new Set();
if (manifest.background?.service_worker) referencedFiles.add(manifest.background.service_worker);
if (manifest.action?.default_popup) referencedFiles.add(manifest.action.default_popup);
if (manifest.options_page) referencedFiles.add(manifest.options_page);
for (const contentScript of manifest.content_scripts || []) {
  for (const file of contentScript.js || []) referencedFiles.add(file);
  for (const file of contentScript.css || []) referencedFiles.add(file);
}

for (const relativePath of referencedFiles) {
  if (/^https?:\/\//i.test(relativePath)) {
    fail(`remote executable resource in manifest: ${relativePath}`);
    continue;
  }
  if (!fs.existsSync(path.join(root, relativePath))) fail(`manifest references missing file: ${relativePath}`);
}

if (!fs.existsSync(path.join(root, 'shared', 'integrity.mjs'))) {
  fail('shared integrity normalization module is missing');
}
if (fs.existsSync(path.join(root, 'content', 'dompurify.min.js'))) {
  fail('vendored DOMPurify must not be reintroduced into the text-only runtime');
}
if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
  fail('runtime npm dependencies require an explicit security review');
}

const dangerousPatterns = [
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /\bnew\s+Function\s*\(/, label: 'new Function()' },
  { pattern: /document\.write\s*\(/, label: 'document.write()' },
  { pattern: /\.innerHTML\s*=/, label: 'innerHTML assignment' },
  { pattern: /\.outerHTML\s*=/, label: 'outerHTML assignment' },
  { pattern: /insertAdjacentHTML\s*\(/, label: 'insertAdjacentHTML()' },
  { pattern: /%%NCBI_(?:TOOL_NAME|API_EMAIL)%%/, label: 'build-time NCBI secret placeholder' }
];

function verifyJavaScript(absolutePath) {
  const relativePath = path.relative(root, absolutePath);
  const syntaxCheck = spawnSync(process.execPath, ['--check', absolutePath], { encoding: 'utf8' });
  if (syntaxCheck.status !== 0) {
    fail(`JavaScript syntax error in ${relativePath}: ${syntaxCheck.stderr.trim()}`);
  }
  if (absolutePath === __filename) return;
  const source = fs.readFileSync(absolutePath, 'utf8');
  for (const { pattern, label } of dangerousPatterns) {
    if (pattern.test(source)) fail(`${label} found in ${relativePath}`);
  }
}

function verifyHtml(absolutePath) {
  const relativePath = path.relative(root, absolutePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  if (/<script\b[^>]*\bsrc\s*=\s*["']https?:/i.test(source)) fail(`remote script found in ${relativePath}`);
  if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/i.test(source)) fail(`inline script found in ${relativePath}`);
}

function verifyWorkflow(absolutePath) {
  const relativePath = path.relative(root, absolutePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const actionUses = source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?\s*$/gm);
  for (const match of actionUses) {
    const reference = match[1];
    if (reference.startsWith('./') || reference.startsWith('docker://')) continue;
    if (!/@[0-9a-f]{40}$/i.test(reference)) {
      fail(`GitHub Action is not pinned to a full commit SHA in ${relativePath}: ${reference}`);
    }
  }
  if (/NCBI_(?:TOOL_NAME|API_EMAIL)_SECRET/.test(source)) {
    fail(`release workflow embeds unnecessary NCBI secrets in ${relativePath}`);
  }
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'docs') continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath);
    else if (/\.(?:c|m)?js$/i.test(entry.name)) verifyJavaScript(absolutePath);
    else if (entry.name.endsWith('.html')) verifyHtml(absolutePath);
    else if (/\.ya?ml$/i.test(entry.name) && absolutePath.includes(`${path.sep}.github${path.sep}workflows${path.sep}`)) {
      verifyWorkflow(absolutePath);
    }
  }
}

walk(root);

if (!process.exitCode) console.log('Extension security verification passed.');
