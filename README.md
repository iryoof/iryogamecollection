# 🎮 Iryo Game Collection

Eine Sammlung mobiler Multiplayer-Partyspiele im Browser. Ein gemeinsames Portal,
drei Spiele, ein Echtzeit-Backend.

**Live:** https://iryoof.github.io/iryogamecollection/

## Die Spiele

| Spiel | Route | Worum es geht |
| --- | --- | --- |
| 🎤 **Cypher** | `/cypher` | Reim-Kettenspiel: Jeder schreibt 2 Zeilen, nur die zweite ist für den Nächsten sichtbar. So entsteht ein gemeinsamer Text mit verstecktem Kontext. |
| ❓ **Wer bin ich** | `/werbinich` | Klassisches Rätselspiel: Jeder bekommt einen Begriff zugewiesen, den alle außer ihm sehen. |
| 📻 **Wavelength** | `/wavelength` | Ein Spieler stellt eine Frage, die anderen schätzen, wo die Antwort auf einer Skala liegt. |

Alle Spiele laufen über Lobby-Codes, sind mobile-first und synchronisieren
per WebSocket. Die Oberfläche gibt es auf Deutsch, Englisch und Französisch.

## Architektur

npm-Workspaces-Monorepo:

```
├── frontend/           React 18 + Vite + TypeScript + Tailwind
│   ├── src/pages/        Portal + ein Container pro Spiel
│   ├── src/games/        Screens pro Spiel (werbinich, wavelength)
│   └── src/locales/      de / en / fr
├── backend/            Express + Socket.IO
│   ├── src/io.ts         Cypher-Handler
│   ├── src/werbinich.ts  Wer-bin-ich-Handler
│   └── src/wavelength.ts Wavelength-Handler
└── shared/             Gemeinsame TypeScript-Typen
```

Jedes Spiel hat eigene Socket-Events mit eigenem Präfix (`wvl:` für Wavelength
usw.) und einen eigenen Lobby-Manager. Der komplette Spielzustand liegt **im
Arbeitsspeicher** des Backends — es gibt keine Datenbank. Ein Neustart des
Render-Services beendet alle laufenden Lobbys.

Das Routing nutzt `HashRouter`, weil GitHub Pages keine SPA-Rewrites kann.

## Schnellstart

Voraussetzungen: Node.js >= 18, npm >= 9.

```bash
npm install
```

```bash
npm run dev
```

Frontend: `http://localhost:5173` — Backend: `http://localhost:3000`

Achtung: `frontend/.env.development` zeigt standardmäßig auf das **produktive**
Backend. Für ein lokales Backend dort `VITE_BACKEND_URL=http://localhost:3000`
setzen.

## Befehle

```bash
npm run dev              # Frontend + Backend
npm run dev:frontend     # nur Frontend
npm run dev:backend      # nur Backend
npm run build            # beides bauen
npm run type-check       # TypeScript prüfen
npm start                # gebautes Backend starten
```

## Deployment

Siehe [DEPLOYMENT.md](./DEPLOYMENT.md). Kurzfassung: Frontend nach GitHub Pages
(automatisch per GitHub Actions bei Push auf `main`), Backend nach Render.

## Lizenz

MIT
