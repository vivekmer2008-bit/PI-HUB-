require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
for (const p of [DATA, UPLOADS]) fs.mkdirSync(p, { recursive: true });
const DB = {
  chats: path.join(DATA, 'chats.json'),
  files: path.join(DATA, 'files.json'),
  logs: path.join(DATA, 'llm-logs.json')
};
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { const temp = file + '.tmp'; fs.writeFileSync(temp, JSON.stringify(value, null, 2)); fs.renameSync(temp, file); }
function id() { return crypto.randomUUID(); }
function safeName(name) { return path.basename(name || 'upload').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 150) || 'upload'; }
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
// This starter is intentionally bound to localhost by default. Do not expose it publicly without authentication/HTTPS.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.static(ROOT, { extensions: ['html'] }));
app.get('/api/health', (_req, res) => res.json({ ok: true, geminiConfigured: !!process.env.GEMINI_API_KEY, model: MODEL, fileCount: readJson(DB.files, []).length, chatCount: readJson(DB.chats, []).length }));

async function callGemini({ message, mode = 'chat', history = [], context = [] }) {
  if (!process.env.GEMINI_API_KEY) {
    const e = new Error('Gemini API key is not configured. Copy .env.example to .env and set GEMINI_API_KEY.'); e.status = 503; throw e;
  }
  const contents = [];
  for (const item of (Array.isArray(history) ? history.slice(-12) : [])) {
    if (!item || !['user', 'model'].includes(item.role) || typeof item.text !== 'string') continue;
    contents.push({ role: item.role, parts: [{ text: item.text.slice(0, 6000) }] });
  }
  const contextText = Array.isArray(context) && context.length
    ? '\n\nProject context supplied by the user (treat as context, not guaranteed truth):\n' + JSON.stringify(context).slice(0, 12000)
    : '';
  contents.push({ role: 'user', parts: [{ text: String(message || '').slice(0, 6000) + contextText }] });
  const body = {
    systemInstruction: { parts: [{ text: 'You are PI Hub Assistant, a careful robotics, electronics, automation, IoT and software project helper. Be practical, state uncertainty, give safety cautions for hardware, and do not claim to control a physical device unless an authenticated device API confirms it. When browsing is enabled, distinguish sourced information from your own explanation.' }] },
    contents,
    generationConfig: { temperature: 0.35, maxOutputTokens: 2048 }
  };
  if (mode === 'research') body.tools = [{ google_search: {} }];
  const started = Date.now();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000)
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = raw?.error?.message || `Gemini request failed (${response.status})`;
    const e = new Error(msg); e.status = response.status === 429 ? 429 : 502; throw e;
  }
  const candidate = raw.candidates?.[0];
  const text = (candidate?.content?.parts || []).map(p => p.text || '').join('\n').trim();
  const gm = candidate?.groundingMetadata;
  const sources = [];
  for (const chunk of (gm?.groundingChunks || [])) {
    const web = chunk.web || chunk.retrievedContext;
    if (web?.uri && !sources.some(s => s.url === web.uri)) sources.push({ title: web.title || web.uri, url: web.uri });
  }
  const entry = { id: id(), createdAt: new Date().toISOString(), mode, model: MODEL, prompt: String(message || '').slice(0, 6000), output: text, sources, latencyMs: Date.now() - started, usage: raw.usageMetadata || null };
  const logs = readJson(DB.logs, []); logs.push(entry); writeJson(DB.logs, logs.slice(-250));
  return { text, sources, requestId: entry.id, model: MODEL, latencyMs: entry.latencyMs, usage: entry.usage };
}
app.post('/api/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required.' });
    const result = await callGemini({ message, mode: req.body?.mode === 'research' ? 'research' : 'chat', history: req.body?.history, context: req.body?.context });
    res.json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message || 'AI request failed.' }); }
});

app.get('/api/chats', (_req, res) => {
  const chats = readJson(DB.chats, []).map(({ messages = [], ...c }) => ({ ...c, messageCount: messages.length, lastMessage: messages.at(-1)?.text || '' })).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ chats });
});
app.post('/api/chats', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 100);
  if (!title) return res.status(400).json({ error: 'Conversation title is required.' });
  const chats = readJson(DB.chats, []); const chat = { id: id(), title, kind: String(req.body?.kind || 'direct').slice(0,30), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] };
  chats.push(chat); writeJson(DB.chats, chats); res.status(201).json({ chat: { ...chat, messageCount: 0, lastMessage: '' } });
});
app.get('/api/chats/:chatId/messages', (req, res) => {
  const chat = readJson(DB.chats, []).find(c => c.id === req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Conversation not found.' });
  res.json({ messages: chat.messages || [] });
});
app.post('/api/chats/:chatId/messages', (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 3000);
  if (!text) return res.status(400).json({ error: 'Message text is required.' });
  const chats = readJson(DB.chats, []); const chat = chats.find(c => c.id === req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Conversation not found.' });
  const message = { id: id(), sender: String(req.body?.sender || 'You').slice(0,80), text, createdAt: new Date().toISOString() };
  chat.messages ||= []; chat.messages.push(message); chat.updatedAt = message.createdAt; writeJson(DB.chats, chats); res.status(201).json({ message });
});

const upload = multer({ dest: UPLOADS, limits: { fileSize: 20 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => {
  const blocked = ['application/x-msdownload', 'application/x-executable'];
  if (blocked.includes(file.mimetype)) return cb(new Error('Executable uploads are not allowed.'));
  cb(null, true);
} });
app.get('/api/storage', (_req, res) => res.json({ files: readJson(DB.files, []).map(({ diskName, extractedText, ...f }) => f) }));
app.post('/api/storage', (req, res) => upload.single('file')(req, res, err => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
  const files = readJson(DB.files, []); const mime = req.file.mimetype || 'application/octet-stream';
  let extractedText = '';
  if (/^(text\/|application\/(json|xml|javascript|x-yaml))/.test(mime) || /\.(txt|md|csv|json|js|ts|py|ino|c|h|yaml|yml|log)$/i.test(req.file.originalname)) {
    try { extractedText = fs.readFileSync(req.file.path, 'utf8').slice(0, 500000); } catch {}
  }
  const f = { id: id(), originalName: safeName(req.file.originalname), diskName: path.basename(req.file.filename), mime, size: req.file.size, tags: String(req.body?.tags || '').slice(0,250), createdAt: new Date().toISOString(), extractedText };
  files.push(f); writeJson(DB.files, files); const { diskName, extractedText: _text, ...publicFile } = f; res.status(201).json({ file: publicFile });
}));
app.get('/api/storage/:fileId/download', (req, res) => {
  const f = readJson(DB.files, []).find(x => x.id === req.params.fileId); if (!f) return res.status(404).json({ error: 'File not found.' });
  const full = path.join(UPLOADS, path.basename(f.diskName)); if (!fs.existsSync(full)) return res.status(404).json({ error: 'Stored file is missing.' });
  res.download(full, f.originalName);
});
app.delete('/api/storage/:fileId', (req, res) => {
  const files = readJson(DB.files, []); const f = files.find(x => x.id === req.params.fileId); if (!f) return res.status(404).json({ error: 'File not found.' });
  try { fs.unlinkSync(path.join(UPLOADS, path.basename(f.diskName))); } catch {}
  writeJson(DB.files, files.filter(x => x.id !== f.id)); res.json({ ok: true });
});
app.post('/api/search', (req, res) => {
  const q = String(req.body?.query || '').trim().toLowerCase(); if (!q) return res.status(400).json({ error: 'Search query is required.' });
  const terms = q.split(/\s+/).filter(Boolean); const results = [];
  for (const f of readJson(DB.files, [])) {
    const hay = `${f.originalName} ${f.tags} ${f.extractedText || ''}`.toLowerCase(); const hits = terms.filter(t => hay.includes(t)).length;
    if (hits) { const idx = hay.indexOf(terms.find(t => hay.includes(t)) || ''); const snippet = (f.extractedText || f.tags || f.originalName).slice(Math.max(0,idx-60), Math.max(0,idx-60)+240); results.push({ type: 'Stored file', title: f.originalName, detail: f.tags, snippet, score: hits, url: `/api/storage/${encodeURIComponent(f.id)}/download` }); }
  }
  for (const c of readJson(DB.chats, [])) for (const m of (c.messages || [])) { const hay = `${c.title} ${m.text} ${m.sender}`.toLowerCase(); const hits = terms.filter(t => hay.includes(t)).length; if (hits) results.push({ type: 'Chat message', title: c.title, detail: `${m.sender} · ${m.createdAt}`, snippet: m.text.slice(0,280), score: hits }); }
  for (const p of (Array.isArray(req.body?.projects) ? req.body.projects : [])) { const hay = `${p.title||''} ${p.category||''} ${p.status||''} ${p.description||p.desc||''} ${p.members||''}`.toLowerCase(); const hits = terms.filter(t => hay.includes(t)).length; if (hits) results.push({ type: 'Project', title: p.title || 'Untitled project', detail: `${p.category||''} · ${p.status||''} · ${p.progress||0}%`, snippet: String(p.description||p.desc||'').slice(0,280), score: hits }); }
  results.sort((a,b) => b.score-a.score); res.json({ query: q, count: results.length, results: results.slice(0,100).map(({score,...r})=>r) });
});
app.get('/api/logs', (_req, res) => res.json({ logs: readJson(DB.logs, []).map(l => ({...l})) }));
app.delete('/api/logs', (_req, res) => { writeJson(DB.logs, []); res.json({ ok: true }); });
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.listen(PORT, HOST, () => console.log(`PI Hub is running at http://${HOST}:${PORT}\nGemini configured: ${!!process.env.GEMINI_API_KEY}\nStorage: ${UPLOADS}`));
