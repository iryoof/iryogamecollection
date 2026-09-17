# Iryo Gamecollection

## ZUERST: Repo-Stand prüfen — nicht verhandelbar

**Vor jeder Aussage über die Struktur und vor der ersten Änderung:**

```bash
git fetch origin && git status -sb && git log --oneline -3 origin/main
```

Bei `behind`: `git merge --ff-only origin/main`.

An diesem Repo arbeiten mehrere parallele Sessions. In der Commit-History tauchen
`David Mehmke`, `iryoof`, `Iryo` und `devin-ai-integration[bot]` auf. Der lokale
Stand ist deshalb regelmäßig veraltet, oft um mehrere Commits.

### Warum das hier so scharf formuliert ist

Am 2026-09-17 wurde hier nach der Repo-Struktur gefragt. Die Antwort beschrieb vier
Spiele und eine Kreuzworträtsel-Architektur aus vorgenerierten Rätseln (`puzzles.ts`,
`loadPuzzle.ts`, `denseGenerator.ts`), samt einer ausführlichen Liste angeblich
verwaister Dateien. Tatsächlich war origin/main drei Commits weiter: das
Kreuzworträtsel war komplett durch ein **Schwedenrätsel mit Live-Generator** ersetzt,
sämtliche genannten Dateien waren gelöscht, und ein fünftes Spiel (Pokémon-Quiz)
existierte, von dem kein Wort in der Antwort stand.

**Das ist nicht bloß peinlich, das ist gefährlich.** Auf so eine Falschauskunft hin
werden Entscheidungen getroffen. Im schlimmsten Fall wird auf einem veralteten Stand
editiert und committet — und damit fremde Arbeit überschrieben.

Derselbe Fehler ist am 2026-09-16 im Schwester-Repo `IryoGameshows` passiert. Es ist
kein Einzelfall, sondern das Standardverhalten, wenn nicht nachgesehen wird.

### Verbindliche Regeln

- **Niemals** aus dem Gedächtnis, aus einer Zusammenfassung oder aus einem früheren
  Tool-Ergebnis über Dateien, Struktur oder Inhalte reden. Immer frisch nachsehen.
- Nach einer Kontext-Kompaktierung gilt **jede** Datei-Information als veraltet.
  Zusammenfassungen beschreiben die Vergangenheit, nicht den aktuellen Stand.
- `git ls-files` allein zeigt nur den **lokalen** Stand. Ohne vorheriges `git fetch`
  ist das Ergebnis wertlos für eine Struktur-Aussage.
- Vor dem ersten Edit in einer Datei: die Datei lesen. Nicht auf eine frühere Version
  im Kontext verlassen.
- Bevor etwas als "fehlt" oder "sollte man bauen" bezeichnet wird: nachsehen, ob es
  schon existiert.
- Im Zweifel nachsehen statt schätzen. Ein zusätzlicher Befehl kostet Sekunden,
  eine Falschauskunft kostet Davids Zeit und Vertrauen.

## Struktur

npm-Workspace mit drei Paketen. **Mit** Build-Step — anders als Gameshows.

```
frontend/       React 18 + Vite + TypeScript + Tailwind
  src/
    Root.tsx        Routing (HashRouter), Einstiegspunkt der Spiele
    pages/          eine Seite pro Spiel + GamePortal (Startseite)
    games/          Spiel-Logik, je ein Ordner
      cypher ist in pages/ + hooks/, hat keinen games/-Ordner
      werbinich/      Mehrspieler
      wavelength/     Mehrspieler
      schwedenraetsel/  Einzelspieler, Live-Generator
      pokemonquiz/      Einzelspieler, PokeAPI
    components/     geteilte Bausteine
    hooks/          useGameSocket, useGameLogic, useTimer
    services/       socketService, archiveService
    locales/        de/en/fr als JSON, geladen von i18n.ts
    styles/         globals.css, Design-Tokens als CSS-Variablen
backend/        Express + Socket.IO
  src/
    server.ts       App, CORS-Allowlist, Health-Check
    io.ts           Socket-Handler Cypher
    werbinich.ts    Socket-Handler Wer bin ich
    wavelength.ts   Socket-Handler Wavelength
    game/           Lobby, GameManager, Archive (+ Wavelength-Pendants)
shared/         gemeinsame TypeScript-Typen
scripts/        Prüf-Skripte (Node, .mjs)
```

### Spiele

| Spiel | Route | Art |
|---|---|---|
| Cypher | `/cypher` | Mehrspieler, Socket |
| Wer bin ich | `/werbinich` | Mehrspieler, Socket |
| Wavelength | `/wavelength` | Mehrspieler, Socket |
| Schwedenrätsel | `/schwedenraetsel` | Einzelspieler, rein clientseitig |
| Pokémon-Quiz | `/pokemonquiz` | Einzelspieler, externe API |

`/kreuzwortraetsel` und `/wavvelength` sind Weiterleitungen auf die heutigen Routen —
alte Links sollen weiter funktionieren, nicht entfernen.

### Socket-Events

Die drei Mehrspieler-Spiele teilen sich **eine** Socket.IO-Instanz ohne Namespaces,
getrennt allein über Event-Namen. Die Konventionen sind uneinheitlich: Cypher nutzt
blanke Namen (`join-lobby`), Wavelength durchgängig `wvl:`, Wer bin ich dagegen
`lobby:create` **ohne** Spielpräfix. Bei einem neuen Mehrspieler-Spiel deshalb ein
eigenes Präfix wählen, sonst kollidiert es mit Wer bin ich.

### Zustand

Kein Datenbanksystem. Lobbys liegen im Arbeitsspeicher des Backend-Prozesses,
Archive schreibt `saveManager.ts` auf die lokale Platte. Render Free-Tier schläft
ein und startet neu — laufende Lobbys sind dann weg, Archivdateien nicht dauerhaft.

## Nach Änderungen

```bash
npm run type-check        # Frontend + Backend
npm run build             # was die Pages-Action auch tut
```

Bei Schwedenrätsel-Änderungen zusätzlich:

```bash
npx tsx scripts/check-schwedenraetsel.mjs   # Gitter lückenlos, Wörter in beiden Richtungen
npx tsx scripts/check-woerter.mjs           # Dubletten, Längenverteilung, zu lange Fragen
```

`npx tsx`, nicht `node`: die Skripte importieren `.ts`-Dateien, deren interne Importe
keine Dateiendung tragen — plain Node scheitert daran mit `ERR_MODULE_NOT_FOUND`.
Der Gitter-Prüfer läuft je nach Maschine ein bis zwei Minuten.

## Deploy

Push auf `main` → GitHub Action (`.github/workflows/`) → `node build.js` → live auf
https://iryoof.github.io/iryogamecollection/

Das Backend liegt getrennt auf Render (Frankfurt, Free-Tier) und wird **nicht** von
dieser Action deployed. Die erlaubten Browser-Origins stehen in `server.ts` und in
`render.yaml` unter `FRONTEND_URL`.

## Sonstiges im Repo

`.github/copilot-instructions.md` ist die Anweisungsdatei für GitHub Copilot und in
Teilen veraltet (nennt nur Cypher, `App.tsx` statt `Root.tsx`, ein nicht existentes
`backend/src/types/`). Nicht als Quelle für die Struktur verwenden.

## Antwortformat

**Jede Nachricht an David beginnt mit einem Backslash `\`.**

Das ist Davids Kontrollzeichen. Es ist bewusst etwas, das nur aus einer echten,
frisch erzeugten Antwort stammen kann — fehlt es, ist die Antwort verdächtig.
Der Backslash steht ganz am Anfang der Nachricht, vor dem ersten Wort.
Nicht weglassen, auch nicht bei kurzen Antworten, Rückfragen oder Fehlermeldungen.

## Ton

Deutsch. Keine Füllwörter, keine gespiegelten Umgangswörter ("yalla", "habibi", "bro").

Keine Behauptung ohne Beleg. Was geprüft wurde, wird als geprüft benannt; was
vermutet wird, als Vermutung. Wenn etwas nicht nachgesehen wurde, wird das gesagt,
statt es plausibel klingen zu lassen.
