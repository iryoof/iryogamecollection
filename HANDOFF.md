# Handoff

Was zuletzt passiert ist und warum. Neueste Einträge oben. Die Regeln dazu
stehen in `CLAUDE.md` unter „Handoff".

Diese Datei beschreibt die Vergangenheit. Vor einer Aussage über den heutigen
Stand trotzdem `git fetch origin` und im Repo nachsehen.

---

## 2026-09-21 — Wortpool erweitert, Kick eingebaut, Musterproblem vermessen

### Gemacht

`9502ba5` **Spieler entfernen für Wer bin ich und Wavelength.** Beide Spiele
hatten keinen Kick — nur Cypher, dort komplett (Backend `io.ts`, Hook
`useGameSocket.ts`, Knopf in `pages/GameSetup.tsx`). Neu sind die Host-Handler
`lobby:kick` in `backend/src/werbinich.ts` und `wvl:lobby:kick` in
`backend/src/wavelength.ts`, ein Entfernen-Knopf in beiden Lobbys und die
Behandlung von `lobby:kicked` / `wvl:lobby:kicked` in den beiden Seiten.

`596e781` **Wortpool um 567 kurze Einträge erweitert.** Zwei neue Dateien
`words/grundwortschatz8.ts` (65× drei, 166× vier Buchstaben) und
`words/grundwortschatz9.ts` (164× fünf, 172× sechs), beide `always: true`.

Beides ist auf `origin/main` gepusht. David wollte ausdrücklich **keinen PR**,
sondern direkt auf `main`.

### Warum so

**Kick zuerst, Reconnect-Patch noch nicht.** Die ungetrackte Datei
`Cypher-push-uncommitted-backup-2026-06-12.patch` enthält ein zusammenhängendes
Vorhaben: solange ein Spiel läuft niemanden wegen Verbindungsabbruch entfernen,
dazu sofortiger Host-Wechsel. Anwendbar ist der Patch nicht — `Wavvelength`
wurde zu `Wavelength` umbenannt, Locales und `CypherGame.tsx` sind gewandert,
`git apply --check` scheitert an sechs Stellen. Inhaltlich fehlt fast alles im
heutigen Code: `shouldKeepDisconnectedPlayer` und `infiniteReconnect` haben null
Treffer, `reconnectionAttempts` steht an vier Stellen auf `5`, den Schlüssel
`reconnectUnlimited` gibt es nicht. Nur das Verbindungsbanner ist nachträglich
in Wer bin ich und Wavelength gelandet, in Cypher nicht.

Wenn niemand mehr entfernt wird, kann eine Lobby dauerhaft auf jemanden warten,
der nicht zurückkommt. Deshalb zuerst der Kick als Notausgang für den Host.

**Kick nur in der Lobby**, nicht im laufenden Spiel — so wie bei Cypher. Ein
bewusster Unterschied zu Cypher: dort ist der Knopf bei getrennten Spielern
ausgeblendet (`GameSetup.tsx:210`), in den zwei neuen bleibt er sichtbar. Ein
hängengebliebener getrennter Spieler ist genau der Fall, für den man ihn
braucht. Ob Cypher angeglichen wird, ist offen.

**Reihenfolge im Kick-Handler ist nicht beliebig.** Der Ziel-Socket verlässt
den Lobby-Raum *vor* dem Roster-Broadcast, damit kein spätes Update nach der
Kick-Meldung eintrifft und den Client zurück auf den Lobby-Screen setzt. Den
persönlichen Raum (`playerId`) verlässt er erst *nach* dem Emit, sonst geht die
Meldung ins Leere.

**Wörter aus öffentlichen Listen, Fragen von Hand.** Quellen waren
`gambolputty/german-nouns` (rund 100.000 Substantiv-Lemmata mit Genus aus dem
deutschen Wiktionary) und `hermitdave/FrequencyWords` `de_50k`. Die Schnittmenge
beider, abzüglich aller 2967 schon vorhandenen Lösungen, ergab 2303 brauchbare
Kandidaten der Länge 3–6. Wortlisten liefern keine Rätselfragen — das ist der
Teil, den keine öffentliche Bank abnimmt.

Aussortiert: Beleidigungen und Kraftausdrücke (die Untertitelliste ist voll
davon, inklusive rassistischer Begriffe), Vornamen, Markennamen und englische
Wörter ohne Fuss im Deutschen.

Drei Buchstaben war der Engpass. Die reine Substantivliste gab dafür wenig her —
deutsche Dreibuchstaben-Substantive sind schnell erschöpft — deshalb stehen dort
auch Abkürzungen, Vorsilben und Lehnwörter, so wie in gedruckten
Schwedenrätseln.

### Geprüft

Kick: `npm run type-check` und `npm run build` sauber, dazu ein Lauf gegen ein
lokal gestartetes Backend mit drei Socket-Clients. Bestätigt: Nicht-Host wird
abgewiesen, Selbstkick wird abgewiesen, das Kick-Event kommt beim Ziel an, das
Roster der Verbleibenden stimmt. **Im Browser mit zwei echten Clients ist es
nicht durchgeklickt** — die Knöpfe selbst sind ungetestet.

Wortpool, je 40 Rätsel pro Grösse, einmal ohne und einmal mit den neuen Dateien:

| Grösse | Wiederholung vorher | nachher | Zeit vorher | nachher |
|---|---|---|---|---|
| klein 7×7 | 1,78× | 1,49× | 77 ms | 20 ms |
| mittel 9×9 | 1,87× | 1,62× | 60 ms | 20 ms |
| gross 11×11 | 2,02× | 1,74× | 225 ms | 94 ms |

Nutzbarer Vorrat der Längen 3–6 von 1877 auf 2444, Dreibuchstaber von 166 auf
231. `npx tsx scripts/check-schwedenraetsel.mjs` mit 40 Läufen je Grösse:
bestanden, 120/120 Rätsel erzeugt, kein Feld ohne Frage.

### Vermessen, aber nicht geändert: warum die Rätsel leicht und die Muster
### ähnlich sind

Beides ist **kein** Wortmengen-Problem.

`patterns.ts` ist eine feste Liste: 24 Formen für 7×7, 24 für 9×9, **18** für
11×11. Bei 40 Rätseln siehst du jede Elfer-Form gut zweimal — daher die
Ähnlichkeit. Der Engpass ist die Formsuche in `pattern.ts`. Über je 60 Versuche
gemessen liefert sie bei 7×7 in 37 % der Fälle eine Form, bei 9×9 und 11×11 nur
in **2 %**. Hochgerechnet braucht es für ~60 zusätzliche Elfer-Formen rund 7.500
Suchversuche, also ein bis zwei Stunden Rechenzeit. Kein einziges neues Wort.

Leicht sind die Rätsel aus drei anderen Gründen: die Gitter sind mit 70 %
(klein), 75 % (mittel) und 79 % (gross) gekreuzten Buchstaben sehr dicht
verzahnt; `pattern.ts:41` deckelt Wörter bei `MAX_WORD = 6`, wodurch **816
Einträge der Länge 7–9 im Pool liegen, die der Generator nie ansieht**; und die
Fragen sind direkte Definitionen (Ø 20 Zeichen).

Am Vorrat liegt es nicht. Nach Häufigkeitsrang aufgeteilt sind von den 2444
nutzbaren Kurzwörtern nur 343 aus den Top 2000, 814 aus dem Bereich 2000–10.000,
1058 seltener als Rang 10.000 und 229 gar nicht in der Liste. Für eine schwere
Stufe (ein 11×11-Gitter verbraucht ~38 Wörter, für ≤1,5× Wiederholung über 40
Rätsel braucht eine Stufe ~1.000–1.500 Wörter) ist genug da — es fehlt der
Schalter, nicht der Vorrat.

### Fallstricke

**`scripts/build-muster.mjs` überschreibt `patterns.ts` bedingungslos**, auch
wenn der Lauf *weniger* Formen gefunden hat als vorher drin standen. Ein
Messlauf mit `--versuche 250` hat die 18 Elfer-Formen durch **eine** ersetzt;
zurückgeholt mit `git checkout --`. Vor dem nächsten Musterlauf muss das Skript
ergänzen statt ersetzen.

**Hilfsskripte müssen unter `scripts/` liegen.** Aus dem Scratchpad heraus
scheitern die relativen Importe auf die `.ts`-Dateien. Und sie laufen nur mit
`npx tsx`, nicht mit `node` — die importierten `.ts`-Dateien haben
endungslose interne Importe.

**Der Bash-Tool ist keine PowerShell.** Ein Commit mit `-m @'…'@` hat den
Betreff zu `@` gemacht; mit `--amend -F -` und einem Heredoc korrigiert.

### Offen

- Reconnect-Patch: die vier restlichen Teile (`reconnectionAttempts: Infinity`,
  Verbindungsbanner für Cypher, unendliche Karenz im laufenden Spiel, sofortiger
  Host-Wechsel). Die Patch-Datei liegt ungetrackt im Wurzelverzeichnis und ist
  nicht anwendbar — sie taugt als Vorlage, nicht zum Einspielen.
- **Der Kick ist noch nicht wirksam.** Die Pages-Action deployt nur das
  Frontend; das Backend liegt getrennt auf Render. Bis Render neu baut, zeigt
  die Lobby den Knopf, aber der Server kennt das Event nicht.
- `build-muster.mjs` reparieren, dann Formen nachgenerieren (Ziel 60–80 je
  Grösse). Grösster sichtbarer Effekt, geringstes Risiko.
- `MAX_WORD` pro Schwierigkeit statt global — holt die 816 langen Wörter ins
  Spiel. Braucht vorher neue Formen für die längeren Läufe.
- Häufigkeitsrang als Feld an jedem Eintrag, damit der Generator nach Seltenheit
  filtern kann.
- 871 der 3838 Einträge sind Dubletten und fallen in `buildPool` still raus,
  teils innerhalb derselben Kategorie (DECKE zweimal in „Alltag & Essen", TURM
  zweimal in „Kultur & Sport"). Die 567 neuen Einträge kollidieren mit keinem.
- `npm run lint` ist wirkungslos: ESLint ist nicht installiert, das Skript endet
  auf `|| true`.
