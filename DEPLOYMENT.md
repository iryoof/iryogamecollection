# 🚀 Deployment

Zwei getrennte Ziele: das statische Frontend liegt auf GitHub Pages, das
Socket.IO-Backend auf Render.

## Frontend — GitHub Pages

Läuft vollautomatisch. Jeder Push auf `main` startet den Workflow
[`.github/workflows/ghpages.yml`](.github/workflows/ghpages.yml), der
`node build.js` ausführt und `frontend/dist` als Pages-Artefakt veröffentlicht.

Ergebnis: https://iryo.bid/

Drei Dinge hängen daran und dürfen nicht auseinanderlaufen:

- `frontend/public/CNAME` enthält `iryo.bid`. Vite kopiert `public/` nach
  `dist/`, damit landet die Datei im Pages-Artefakt. Fällt sie weg, fällt die
  Seite auf die alte Pages-Adresse zurück.
- `base: '/'` in `frontend/vite.config.ts`, weil die Seite unter der eigenen
  Domain in der Wurzel liegt. Vor dem Domainwechsel stand hier
  `/iryogamecollection/`, der Repository-Name.
- `VITE_BACKEND_URL` wird im Workflow gesetzt (nicht aus `.env.production`
  gelesen) und muss auf die Render-URL zeigen.

### Eigene Domain

DNS bei der Registrar-Verwaltung von `iryo.bid`:

| Typ | Name | Wert |
| --- | --- | --- |
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| CNAME | `www` | `iryoof.github.io.` |

Dazu in den Repository-Einstellungen unter *Pages → Custom domain* `iryo.bid`
eintragen und *Enforce HTTPS* setzen, sobald GitHub das Zertifikat ausgestellt
hat. Die alte Adresse `iryoof.github.io/iryogamecollection/` leitet GitHub danach
auf die eigene Domain um.

Weil GitHub Pages keine SPA-Rewrites unterstützt, nutzt die App `HashRouter`;
`frontend/public/404.html` fängt direkte Deep-Links ab.

### Lokal testen

```bash
npm run build --workspace=frontend && npm run preview --workspace=frontend
```

## Backend — Render

Konfiguriert in [`render.yaml`](./render.yaml):

| Einstellung | Wert |
| --- | --- |
| Build Command | `npm install && npm run build --workspace=backend` |
| Start Command | `npm start --workspace=backend` |
| Region / Plan | Frankfurt / Free |
| Health Check | `/health` |

Aktueller Service: `https://cypher-backend-ume8.onrender.com`

### Environment Variables

| Variable | Bedeutung |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | von Render gesetzt |
| `FRONTEND_URL` | Komma-getrennte Liste erlaubter Browser-Origins |

`FRONTEND_URL` ist die CORS-Allowlist. Einträge sind **Origins**, keine URLs mit
Pfad — also `https://iryo.bid`, nicht `https://iryo.bid/cypher`. Mehrere
Einträge werden mit Komma getrennt, damit z. B. ein lokaler Dev-Server gegen das
Prod-Backend testen kann:

```
FRONTEND_URL=https://iryo.bid,https://www.iryo.bid,https://iryoof.github.io,http://localhost:5173
```

Dieselben Origins stehen zusätzlich als `DEFAULT_ALLOWED_ORIGINS` in
`backend/src/server.ts`, damit ein fehlendes `FRONTEND_URL` die Seite nicht
abschaltet.

## Nach dem Deploy

```bash
curl https://cypher-backend-ume8.onrender.com/health
```

## Troubleshooting

**WebSocket verbindet nicht.** Fast immer CORS: prüfen, ob die Origin des
Frontends exakt in `FRONTEND_URL` steht. Das Backend loggt die aktive Allowlist
beim Start (`Allowed origins: ...`).

**Erste Verbindung dauert ~30 Sekunden.** Der Free-Plan von Render fährt den
Service nach 15 Minuten Inaktivität herunter. Der erste Aufruf weckt ihn.

**Laufende Spiele sind nach einem Deploy weg.** Erwartetes Verhalten — der
Spielzustand liegt nur im Arbeitsspeicher, es gibt keine Datenbank.

**Pages-Seite zeigt 404 oder leere Seite.** `base` in `vite.config.ts` gegen den
Repository-Namen prüfen.
