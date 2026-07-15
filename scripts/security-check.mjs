#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const skippedDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const skippedFiles = new Set(['scripts/security-check.mjs', 'package-lock.json']);
const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.html', '.css']);
const findings = [];

function report(file, rule, detail) {
  findings.push({ file, rule, detail });
}

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    const rel = relative(root, fullPath).split('\\').join('/');
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) await walk(fullPath, output);
    } else if (textExtensions.has(extname(entry.name).toLowerCase()) && !skippedFiles.has(rel)) {
      output.push(rel);
    }
  }
  return output;
}

const files = await walk(root);
const credentialPatterns = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['openai-like-key', /\bsk-[A-Za-z0-9_-]{24,}\b/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
];

for (const file of files) {
  const text = await readFile(resolve(root, file), 'utf8');
  for (const [rule, pattern] of credentialPatterns) {
    if (pattern.test(text)) report(file, rule, 'credential-shaped value found');
  }
  if (/\b(?:localStorage|sessionStorage)\b[\s\S]{0,160}\b(?:password|credential|token|secret)\b/i.test(text)) {
    report(file, 'browser-secret-storage', 'sensitive authentication or credential data must not use browser storage');
  }
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) {
    report(file, 'dynamic-code', 'dynamic code execution requires explicit review');
  }
}

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.startsWith('.env') && entry.name !== '.env.example') {
    report(entry.name, 'populated-env', 'only the sanitized .env.example may be tracked');
  }
}

const routers = await readFile(resolve(root, 'server/routers.ts'), 'utf8');
if (/\bpublicProcedure\b/.test(routers)) report('server/routers.ts', 'public-control-plane', 'dashboard procedures must require an operator session');
if (/\bcredential\s*[:,]\s*account\.credential\b/.test(routers)) report('server/routers.ts', 'credential-response', 'raw credentials must not be returned');

const server = await readFile(resolve(root, 'server/index.ts'), 'utf8');
if (/app\.use\(cors\(\)\)/.test(server)) report('server/index.ts', 'wildcard-cors', 'bare CORS middleware is not allowed');
if (!/express\.json\(\{\s*limit:\s*'32kb'\s*\}\)/.test(server)) report('server/index.ts', 'body-limit', 'the JSON request size limit is missing');

const trpc = await readFile(resolve(root, 'server/trpc.ts'), 'utf8');
if (!/protectedProcedure/.test(trpc) || !/UNAUTHORIZED/.test(trpc)) {
  report('server/trpc.ts', 'auth-boundary', 'protected tRPC procedure enforcement is missing');
}

const envExample = await readFile(resolve(root, '.env.example'), 'utf8');
for (const name of ['DASHBOARD_AUTH_SECRET', 'DASHBOARD_ADMIN_PASSWORD_HASH']) {
  const match = envExample.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match || match[1].trim()) report('.env.example', 'populated-auth-example', `${name} must be present and blank`);
}

const docker = await readFile(resolve(root, 'Dockerfile'), 'utf8');
if (!/CMD \["npm", "start"\]/.test(docker) || /server\/index\.ts/.test(docker)) {
  report('Dockerfile', 'source-runtime', 'production must run the compiled server through npm start');
}
if (!/USER node/.test(docker)) report('Dockerfile', 'root-container', 'production container must run as the node user');

for (const file of files) {
  const info = await stat(resolve(root, file));
  if (info.size > 1_000_000) report(file, 'large-source-file', 'unexpected active text file exceeds 1 MB');
}

if (findings.length) {
  console.error(`Security check failed with ${findings.length} finding(s):`);
  for (const finding of findings) console.error(`- ${finding.file} [${finding.rule}]: ${finding.detail}`);
  process.exit(1);
}

console.log(`Security check passed for ${files.length} active text files.`);
