# A Place About Falling: Einrichtung für dich (einmalig, ca. 15 Minuten)

Du stellst zwei Dinge bereit:

- **Die gemeinsame Seite** auf GitHub Pages. Alle Freunde nutzen dieselbe Seite.
- **Eine Vorlage-Tabelle (Master)**, die Freunde mit einem Klick kopieren.

Freunde brauchen kein GitHub und fassen keinen Code an.

---

## 1. Die Seite auf GitHub

1. Neues **öffentliches** Repo anlegen, z. B. `a-place-about-falling`.
2. Alle Dateien aus diesem Ordner hochladen. Den Ordner `apps-script/` darfst du mit hochladen: Dort stehen **keine** Schlüssel oder Kalender-IDs mehr drin.
3. Settings → Pages → Branch `main` / root → Save.
4. Die Adresse lautet dann `https://mamfredm.github.io/a-place-about-falling/`.
   Falls du das Repo anders nennst, ändere oben in `apps-script/Code.gs` die Zeile `PAGE_BASE`.

## 2. Die Vorlage-Tabelle (Master)

> Nimm dafür eine **neue, leere** Tabelle, nicht deine eigene mit echten Daten. Freunde kopieren alles, was darin steht.

1. [sheets.new](https://sheets.new) → Name: **A Place About Falling (Vorlage)**.
2. **Erweiterungen → Apps Script**.
3. Den Inhalt von `Code.gs` durch `apps-script/Code.gs` ersetzen.
4. Links bei „Dateien" auf **+ → HTML** klicken und die Datei genau **`Setup`** nennen. Den Inhalt durch `apps-script/Setup.html` ersetzen.
5. Links bei **Dienste (+)** → **Google Calendar API** → Hinzufügen.
   - Alternative: Projekteinstellungen (Zahnrad) → „Manifestdatei appsscript.json im Editor anzeigen" anhaken, dann `appsscript.json` mit der Datei aus dem Ordner ersetzen. Das setzt auch die Zeitzone und hinterlegt die Web-App-Einstellungen (Ausführen als: Ich, Zugriff: Jeder). Google sollte die dann beim Bereitstellen schon vorauswählen. Prüfen solltest du sie trotzdem. **Empfohlen.**
6. Speichern (💾).
7. Oben im Funktions-Dropdown **`prepareTemplate`** wählen → **Ausführen** → erlauben.
   Das baut den Tab „Start here" und räumt alles andere weg.
8. Zurück in der Tabelle: **Freigeben** → Allgemeiner Zugriff: **Jeder mit dem Link** → **Betrachter**.
9. Den Link kopieren und das Ende `/edit…` durch **`/copy`** ersetzen:
   `https://docs.google.com/spreadsheets/d/DEINE-ID/copy`
10. Diesen Link in `setup.html` bei `COPY_URL` eintragen und wieder hochladen.

## 3. Selbst einmal testen

Öffne `…/setup.html` und mach den Ablauf wie ein Freund durch. Am besten mit einem zweiten Google-Konto, mindestens aber mit einer eigenen Kopie. So siehst du genau, was die anderen sehen.

Deine bestehende Seite `climb-with-me` läuft davon unabhängig weiter. Wenn du umziehen willst: eigene Kopie der Vorlage einrichten, deinen Boulder-Kalender auswählen, fertig. Danach den neuen Link teilen.

## 4. Was Freunde bekommen

- **Öffentlicher Link:** `https://mamfredm.github.io/a-place-about-falling/?c=AKfy…`. Der lange Teil ist ihre eigene Skript-Adresse. Zum Teilen gibt es den QR-Code.
- **Admin-Link:** derselbe Link plus `&admin=…`. Das Admin-Wort wird automatisch erzeugt, z. B. `crimp-otter-412-a9f3`.
- **Ohne `?c=`** zeigt die Seite eine Startseite mit „Get your own page" und „See a demo".
- **`?c=demo`** zeigt Beispieldaten.

## 5. Updates

- **Design/Seite** (`index.html` usw.): einfach hochladen, gilt sofort für alle.
- **Google-Skript** (`Code.gs`): jede Kopie hat ihr eigenes. Ändere es nur, wenn es wirklich nötig ist. Wenn doch:
  1. `BACKEND_VERSION` in `Code.gs` erhöhen.
  2. In `index.html` `LATEST_BACKEND` auf dieselbe Zahl setzen.
  3. Freunde sehen dann im Dashboard einen Hinweis. Sie fügen den neuen Code ein und gehen auf Bereitstellen → Bereitstellungen verwalten → Stift → Neue Version. Der Link bleibt gleich.
  4. Die Seite sollte mit älteren Skripten weiter funktionieren.

## 6. Rechtliches (bitte prüfen lassen)

- **`privacy.html`** ist eine ehrliche Vorlage, keine Rechtsberatung.
  - Verantwortlich ist jeweils die Person, deren Seite es ist. Name und E-Mail kommen aus ihrer Einrichtung.
  - Du stellst nur die Dateien bereit.
- **`rechtliches.html`** ist noch dein altes Impressum + Datenschutz von climb-with-me. Für das Projekt reicht dort das Impressum. Der Datenschutz-Teil kann raus oder auf `privacy.html` verweisen.
