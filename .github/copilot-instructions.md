# Iryo Gamecollection — Entwicklungshinweise

Sammlung mehrerer Partyspiele unter einem Dach: drei Mehrspieler-Spiele über
WebSockets und zwei Einzelspieler-Spiele, die ohne Backend laufen.

> **Die maßgebliche Beschreibung des Repos steht in `CLAUDE.md` im Wurzelverzeichnis.**
> Dort stehen Struktur, Spiele, Socket-Konventionen und Deploy im Detail. Diese Datei
> hier beschränkt sich auf das, was beim Schreiben von Code im Editor hilft. Bei
> Widersprüchen gilt `CLAUDE.md` — und im Zweifel das Repo selbst, nicht diese Datei:
> beide sind schon einmal auseinandergelaufen.

## Tech-Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **Backend**: Express + Socket.IO + TypeScript
- **shared/**: gemeinsame TypeScript-Typen
- npm-Workspace über `frontend`, `backend`, `shared`

## Befehle

```bash
npm install
npm run dev          # Frontend und Backend parallel
npm run dev:frontend
npm run dev:backend
npm run build        # beide Pakete
npm run type-check   # beide Pakete, muss vor jedem Commit sauber sein
```

Für das Schwedenrätsel gibt es zwei Prüf-Skripte, die mit `npx tsx` laufen müssen
(nicht `node` — die Skripte importieren `.ts`-Dateien mit endungslosen Importen):

```bash
npx tsx scripts/check-schwedenraetsel.mjs
npx tsx scripts/check-woerter.mjs
```

## Spiele und wo ihr Code liegt

| Spiel | Route | Seite | Logik |
|---|---|---|---|
| Cypher | `/cypher` | `pages/CypherGame.tsx` | `hooks/`, Backend `io.ts` |
| Wer bin ich | `/werbinich` | `pages/WerBinIchGame.tsx` | `games/werbinich/`, Backend `werbinich.ts` |
| Wavelength | `/wavelength` | `pages/WavelengthGame.tsx` | `games/wavelength/`, Backend `wavelength.ts` |
| Schwedenrätsel | `/schwedenraetsel` | `pages/SchwedenraetselGame.tsx` | `games/schwedenraetsel/` |
| Pokémon-Quiz | `/pokemonquiz` | `pages/PokemonQuizGame.tsx` | `games/pokemonquiz/` |

Routing steht in `frontend/src/Root.tsx`. Die Routen `/kreuzwortraetsel` und
`/wavvelength` leiten auf die heutigen Namen um — alte Links sollen weiter
funktionieren, also nicht entfernen.

Ein neues Spiel braucht: einen Ordner unter `games/`, eine Seite unter `pages/`,
einen Eintrag in `Root.tsx` und eine Kachel in `pages/GamePortal.tsx`.

## Socket-Events

Die drei Mehrspieler-Spiele teilen sich **eine** Socket.IO-Instanz ohne Namespaces,
getrennt allein über Event-Namen. Die bestehenden Konventionen sind uneinheitlich:

- Cypher: blanke Namen — `join-lobby`, `create-lobby`
- Wer bin ich: `lobby:create`, `game:start` — **ohne** Spielpräfix
- Wavelength: durchgängig `wvl:` — `wvl:lobby:create`

Ein neues Mehrspieler-Spiel bekommt ein **eigenes Präfix**, sonst kollidiert es mit
Wer bin ich.

## Coding-Standards

### TypeScript
- `strict: true` in beiden Paketen — ist gesetzt, nicht aufweichen.
- Interfaces für Objektformen, `any` nur mit Begründung im Kommentar.
- Typen, die Frontend und Backend teilen, gehören nach `shared/types.ts`.

### Benennung
- Komponenten: PascalCase (`MyComponent.tsx`)
- Funktionen und Variablen: camelCase
- Konstanten: UPPER_SNAKE_CASE
- Event-Handler: `onActionName`

### Styling
- Tailwind-Klassen sind der Normalfall (`tailwind.config.cjs`).
- Farben und Flächen kommen aus den CSS-Variablen in `styles/globals.css`
  (`--bg`, `--panel`, `--line`, `--text`, `--muted` …), nicht als feste Hex-Werte
  im Bauteil. Dunkles Design, mobil zuerst.
- Fertige Klassen aus `globals.css` nutzen statt neue zu erfinden:
  `screen-shell`, `surface-panel`, `hero-title`, `section-kicker`,
  `action-primary` / `action-secondary` / `action-danger` / `action-ghost`.
- Keine UI-Bibliotheken dazunehmen.

### Sonstiges
- Socket-Listener beim Aufräumen wieder abmelden.
- Fehlerbehandlung bei jedem `await`.
- Text gehört nach `frontend/src/locales/` (de/en/fr), nicht fest in die Komponente.

## Zustand und Daten

Kein Datenbanksystem. Lobbys liegen im Arbeitsspeicher des Backend-Prozesses,
Archive schreibt `backend/src/saveManager.ts` als JSON auf die lokale Platte. Das
Backend läuft auf Renders Free-Tier, schläft ein und startet neu — laufende Lobbys
sind dann weg, Archivdateien überleben einen Neustart nicht zuverlässig.

Die Einzelspieler-Spiele brauchen das Backend nicht: das Schwedenrätsel erzeugt
seine Gitter im Browser, das Pokémon-Quiz holt seine Daten direkt aus der PokeAPI.

## Deploy

Push auf `main` → GitHub Action → `node build.js` → GitHub Pages unter
https://iryoof.github.io/iryogamecollection/

Das Backend wird davon **nicht** mitdeployed; es liegt getrennt auf Render. Die
erlaubten Browser-Origins stehen in `backend/src/server.ts` und in `render.yaml`
unter `FRONTEND_URL`.

## Bekannte Stolpersteine

- `npm run lint` ist derzeit wirkungslos: ESLint ist nicht installiert und es gibt
  keine Konfigurationsdatei, das Skript endet auf `|| true`. Als Prüfung taugt
  `npm run type-check`.
- Beim Socket-Verbindungsaufbau zuerst die CORS-Allowlist in `server.ts` prüfen;
  ein unbekannter Origin führt nicht zu einem Fehler, sondern zu einem stillen
  fehlenden Header.
- `frontend/src/games/` enthält keinen `cypher`-Ordner — dieses Spiel lebt in
  `pages/` und `hooks/`.
