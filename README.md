# PI Hub AI Workspace (prototype)

This is an upgraded PI Hub web-app starter. It adds:

- Google Gemini API chat via a **server-side** API proxy (API key is not placed in browser code)
- Optional Gemini web research using Google Search grounding
- WhatsApp-style persistent chat threads/messages on the local PI Hub server
- A server-owned file area at `data/uploads/` with upload, list, download and delete
- Workspace search across stored text/code files, saved chat messages and project records supplied by the app
- An LLM Data Console for visible prompts, final responses, model name, latency, returned sources and API usage metadata when supplied
- The existing PI Hub projects, project photos, voice studio, group board, charts, device setup and animated intro

## Requirements

- Node.js 20 or newer
- Internet access for `npm install` and live Gemini requests
- A Gemini API key from Google AI Studio for live AI (optional for exploring the rest of the prototype)

## Start on Windows

1. Extract the ZIP fully; keep `assets/` next to `index.html`.
2. Double-click `START-LOCAL-WINDOWS.bat`, or open PowerShell in this folder and run:

   ```powershell
   Copy-Item .env.example .env -ErrorAction SilentlyContinue
   npm install
   notepad .env
   npm start
   ```

3. In `.env`, add your own key after `GEMINI_API_KEY=`. Keep `.env private; never share it or upload it to GitHub.
4. Open `http://127.0.0.1:4173` in your browser.
5. In the app menu, open **Gemini AI Workspace** and press **Check connection**.

Get/manage the key in Google AI Studio: https://aistudio.google.com/app/apikey
Official Gemini docs: https://ai.google.dev/gemini-api/docs/ai-studio-quickstart

## What “own storage” means here

Files uploaded in My Storage are saved on the computer running this server, in `data/uploads/`; metadata and searchable text are saved in JSON files under `data/`. Chats and LLM request logs are also stored in that local `data/` folder. Back up `data/` to preserve your files. This is not yet cloud sync and will not automatically sync between phones.

## Search behavior

- **PI Hub Search** searches stored file names/tags and the text extracted from supported plain-text/code/CSV/JSON/Markdown/log files, saved chat messages, and project records passed by the app.
- PDFs and other binary files can be stored and downloaded, but this starter does not OCR/extract their contents yet.
- Turn on **Include web research with Gemini** to ask Gemini to use Google Search grounding (requires a configured key, connectivity, and API support). Web research is not a complete internet crawler or a full Google-scale search engine.

## LLM Data Console

The console records and shows the prompt sent, final visible model output, model name, timestamp, latency, returned source links and usage metadata when returned by the API. It intentionally does **not** expose hidden chain-of-thought or private internal reasoning. Logs may contain sensitive prompts; use the Clear logs button when appropriate.

## Important security limitations

This is a local, single-trusted-machine prototype, not a production multi-user service. The demo login in the existing UI is not server authentication. Do not expose the server to the public internet. Before use by real students/faculty or multiple phones, implement verified user accounts, session cookies, role-based access checks on every API, per-chat/group membership, CSRF/rate limiting, HTTPS, malware scanning, encrypted backups and data retention controls. The server binds to `127.0.0.1` by default intentionally. For multi-device use, deploy behind a properly secured HTTPS reverse proxy and add authentication first.

## Troubleshooting

- If Gemini shows “Needs API key”, confirm `.env` exists, `GEMINI_API_KEY` is filled, then restart `npm start`.
- If upload fails, check available disk space and that `data/uploads/` is writable.
- If npm install fails, install Node.js 20+ and run `npm install` again.
- If opening `index.html` directly from a file manager, API-backed features will not work. Start the server and use `http://127.0.0.1:4173`.
