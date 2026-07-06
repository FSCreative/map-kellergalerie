# MAP Kellergalerie – Website

Moderne, mobilfähige Website der [MAP Kellergalerie](https://www.map-kellergalerie.at) (Montafoner Artgenossen Plattform, Schruns) mit integriertem Admin-Bereich zum Bearbeiten von Texten und Fotos.

## Funktionen

- Startseite mit Hero, letzten Ausstellungen, Zitat und Öffnungszeiten
- Ausstellungsarchiv mit Kategorie-Filter und Detailseiten inkl. Lightbox-Galerie
- Publikationen, Sponsoren, Über uns (Team), Kontakt
- Vollständig responsive (Mobile-Navigation, Touch-Lightbox)
- **Admin-Bereich** unter `/admin` (Link in der Fußzeile): Texte, Ausstellungen, Publikationen, Team und Sponsoren bearbeiten, Fotos hochladen

## Technik

Reines Node.js **ohne externe Abhängigkeiten** (eigener Mini-Router, EJS-kompatibler Template-Renderer, Multipart-Upload-Parser und signierte Cookie-Sessions in `lib/mini.js`). Inhalte liegen als JSON in `DATA_DIR` (Standard: `./data-live`), hochgeladene Bilder in `DATA_DIR/uploads`. Beim ersten Start wird `seed/content.json` (die von der alten Website übernommenen Inhalte samt Bildern in `public/images`) automatisch übernommen.

## Lokal starten

```bash
npm start
# http://localhost:3000
```

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `3000` | Server-Port (Railway setzt das automatisch) |
| `ADMIN_PASSWORD` | `kellergalerie2026` | Passwort für den Admin-Bereich – **unbedingt ändern!** |
| `SESSION_SECRET` | (unsicherer Default) | Zufälliger String zum Signieren der Login-Session |
| `DATA_DIR` | `./data-live` | Speicherort für Inhalte & Uploads |

## Deployment auf Railway

1. Neues Projekt → „Deploy from GitHub repo“ → dieses Repository wählen
2. **Volume** hinzufügen und auf `/data` mounten (damit Änderungen aus dem Admin-Bereich Deployments überleben)
3. Variablen setzen: `DATA_DIR=/data`, `ADMIN_PASSWORD=<sicheres Passwort>`, `SESSION_SECRET=<zufälliger String>`
4. Unter Settings → Networking eine Domain generieren

Ohne Volume funktioniert die Seite ebenfalls, aber Admin-Änderungen gehen bei jedem neuen Deployment verloren.
