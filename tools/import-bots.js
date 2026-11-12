#!/usr/bin/env node
// Bulk-import characters into YOUR running SillyTavern, from a text file.
//
//   1. Start SillyTavern (node server.js) and leave it running.
//   2. Create a text file, e.g. my-bots.txt, with one entry per line:
//        https://chub.ai/characters/someone/some-bot
//        https://janitorai.com/characters/<uuid>_character-name
//        C:\Users\you\Downloads\some-card.png      (a card file you already have)
//        # lines starting with # are ignored
//   3. In another terminal:  node tools/import-bots.js my-bots.txt
//
// Optional: --url http://127.0.0.1:8000   (default)
//
// Everything is imported into your local SillyTavern library only. Nothing is uploaded elsewhere.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
const base = (urlFlag >= 0 ? args.splice(urlFlag, 2)[1] : 'http://127.0.0.1:8000').replace(/\/$/, '');
const listFile = args[0];

if (!listFile || !fs.existsSync(listFile)) {
    console.error('Usage: node tools/import-bots.js <list.txt> [--url http://127.0.0.1:8000]');
    process.exit(1);
}

const entries = fs.readFileSync(listFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const cookies = new Map();

function remember(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
}

const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

async function call(route, init = {}) {
    const res = await fetch(base + route, { ...init, headers: { ...(init.headers ?? {}), Cookie: cookieHeader(), 'X-CSRF-Token': csrf } });
    remember(res);
    return res;
}

let csrf = 'disabled';
try {
    const res = await fetch(base + '/csrf-token');
    remember(res);
    csrf = (await res.json()).token;
} catch {
    console.error(`Could not reach SillyTavern at ${base}. Is it running? (start it with: node server.js)`);
    process.exit(1);
}

async function upload(buffer, fileName) {
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const form = new FormData();
    form.append('avatar', new Blob([buffer]), fileName);
    form.append('file_type', ext);
    form.append('user_name', 'User');
    const res = await call('/api/characters/import', { method: 'POST', body: form });
    if (!res.ok) throw new Error(`import failed (HTTP ${res.status})`);
    const body = await res.json().catch(() => ({}));
    return body.file_name ?? fileName;
}

let ok = 0;
const failed = [];
for (const entry of entries) {
    try {
        let buffer, fileName;
        if (/^https?:\/\//i.test(entry)) {
            const res = await call('/api/content/importURL', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: entry }),
            });
            if (!res.ok) throw new Error(`download failed (HTTP ${res.status}) - unsupported site, bad link, or the bot is private/removed`);
            if (res.headers.get('X-Custom-Content-Type') !== 'character') throw new Error('that link is not a character');
            buffer = Buffer.from(await res.arrayBuffer());
            const disp = res.headers.get('Content-Disposition') ?? '';
            fileName = decodeURI(/filename="(.+)"/.exec(disp)?.[1] ?? 'imported.png');
        } else if (fs.existsSync(entry)) {
            buffer = fs.readFileSync(entry);
            fileName = path.basename(entry);
        } else {
            throw new Error('not a link and not an existing file');
        }
        const name = await upload(buffer, fileName);
        console.log(`OK    ${entry}  ->  ${name}`);
        ok++;
    } catch (err) {
        console.log(`FAIL  ${entry}  (${err.message})`);
        failed.push(entry);
    }
}

console.log(`\nDone: ${ok} imported, ${failed.length} failed. Refresh the SillyTavern page to see them.`);
process.exit(failed.length ? 2 : 0);
