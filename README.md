# CineWheels

Trainingssimulator für Kamera-Wheels (Geared Head / Remote Head). Über einer Low-Poly-3D-Welt
liegen zwei Handräder, mit denen du per Touch eine Kamera auf einem Stativ schwenkst. Links Pan, rechts Tilt.
Beide Wheels lassen sich gleichzeitig bedienen.

- Reines HTML/CSS/JavaScript mit ES-Modulen, **kein Build-Schritt**
- Three.js liegt lokal unter `js/vendor/` (r170), keine CDN-Abhängigkeit
- Installierbar als PWA, danach **offline** nutzbar
- Für Handy und iPad im **Querformat**

## Bedienung

| Element | Funktion |
|---|---|
| Wheel links / rechts | Pan / Tilt. Finger auf das Rad legen und **im Kreis kurbeln**. Gewischt wird nicht. |
| Knopf über dem Wheel | Gang 1–3 (15° / 30° / 60° Kameradrehung pro Wheel-Umdrehung) |
| Objektiv unten Mitte | Zoom-Regler 18–135 mm und Festbrennweiten 18/24/35/50/85/135 mm |
| `2.39:1` oben | Framelines umschalten (2.39:1 ↔ 16:9) |
| Pause-Knopf | Pause, Neustart, Einstellungen, Hauptmenü |

**Wheel-Modi** (Einstellungen):
- *Realistisch*: Die Wheels haben Schwungmasse und laufen nach dem Loslassen gedämpft aus. Die Dämpfung ist einstellbar. Antippen stoppt das Rad.
- *Direkt*: Keine Trägheit, die Kamera folgt dem Finger 1:1.

Außerdem einstellbar: Übersetzung und Richtung pro Achse, Wheel-Größe, Wheels links/rechts tauschen,
Richtungspfeil zum Ziel und Grafikqualität (Pixel Ratio 1 / 1,5 / 2).

## Modi

1. **Freies Filmen**: Filmset mit Straße, Häusern, Platz, Passanten, Autos und Drohne. Kein Score.
2. **Weg folgen**: Ein Marker läuft auf einem sichtbaren Pfad, den du im Fadenkreuz hältst. 13 Level, u. a.
   Gerade Linie, Diagonale, Kreis, Acht, Wechselndes Tempo, Profi-Acht (85 mm).
3. **Ziel verfolgen**: Halte bewegte Objekte im Bild. 11 Level, u. a. Spaziergänger, Auto, Läufer, Radfahrer, Drohne, Springender Ball,
   Verfolgungsjagd, Drohnen-Akrobatik (85 mm).

4. **Kranfahrt**: Die Kamera bewegt sich selbst, während du ein Ziel verfolgst. 6 Level: Kran hoch, Kranschwenk,
   Dolly-Fahrt, Parallelfahrt (Kamera-Auto neben dem Zielauto), Verfolgerfahrt um den Block, Parallelfahrt mit Kran.

In den Leveln ist das Objektiv vorgegeben, damit die Bestwerte vergleichbar bleiben.

### Score

Gemessen wird in jedem Frame der Abstand des Ziels zum Bildmittelpunkt **in Prozent der Bildbreite**
(Breite des Frameline-Rechtecks). Daraus ergeben sich:

- **Genauigkeit**: zeitgewichteter Mittelwert von `1 − Abweichung / 20 %`, begrenzt auf 0–100 %
- **Ø Abweichung** in % der Bildbreite
- **Zeit im Zielbereich**: Abweichung ≤ 5 % der Bildbreite (gestrichelter Kreis)
- **Sterne**: ★ ab 50 %, ★★ ab 70 %, ★★★ ab 85 % Genauigkeit

Die Bestwerte pro Level speichert die App in `localStorage`.

## Lokal starten

ES-Module funktionieren nicht über `file://`, die App muss also über einen Webserver laufen.
Wähle eine der folgenden Möglichkeiten und öffne danach `http://localhost:8080`.

**Windows ohne weitere Software** (liegt bei):
```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

**Mit Python**:
```bash
python -m http.server 8080
```

**Mit Node.js**:
```bash
npx serve -l 8080
```

Am Desktop lassen sich die Wheels mit der Maus bedienen. Für echtes Multitouch brauchst du ein Touch-Gerät.

## Auf dem Handy / iPad testen

### Variante A: im lokalen WLAN (schnell, ohne PWA)

1. Rechner und Handy ins selbe WLAN bringen.
2. Server so starten, dass er im Netzwerk erreichbar ist:
   - Python: `python -m http.server 8080 --bind 0.0.0.0`
   - Node: `npx serve -l 8080`
   - PowerShell: `serve.ps1 -Lan`. Dafür ist eine Admin-Konsole nötig, alternativ einmalig
     `netsh http add urlacl url=http://+:8080/ user=Jeder` ausführen. Eventuell muss Port 8080 in der Windows-Firewall freigegeben werden.
3. IP-Adresse des Rechners herausfinden (Windows: `ipconfig`, z. B. `192.168.1.23`).
4. Auf dem Handy `http://192.168.1.23:8080` öffnen und ins Querformat drehen.

Über `http://` mit IP-Adresse laufen Service Worker und PWA-Installation **nicht**, denn Browser
erlauben sie nur über HTTPS oder `localhost`. Die App selbst funktioniert trotzdem vollständig.

### Variante B: über GitHub Pages (HTTPS, mit PWA und Offline)

1. Den Ordnerinhalt in ein GitHub-Repository hochladen. `index.html` muss im Wurzelverzeichnis liegen.
2. Im Repository unter *Settings → Pages* als Quelle „Deploy from a branch“, Branch `main`, Ordner `/ (root)` wählen.
3. Nach ca. einer Minute ist die App unter `https://<nutzer>.github.io/<repo>/` erreichbar.
4. Installieren:
   - **iPhone/iPad (Safari)**: Teilen → *Zum Home-Bildschirm*
   - **Android (Chrome)**: Menü → *App installieren* bzw. *Zum Startbildschirm hinzufügen*
5. Nach dem ersten Laden ist die App offline nutzbar.

Alle Pfade sind relativ, die App läuft deshalb auch in einem Unterordner.

### Updates ausliefern

Der Service Worker lädt online immer zuerst die aktuelle Version aus dem Netz und fällt nur offline
(oder nach 3 s ohne Antwort) auf den Cache zurück. Kommen neue Dateien hinzu, trägst du sie in
`sw.js` in die Liste `ASSETS` ein und erhöhst `VERSION`.

## Projektstruktur

```
index.html              App-Shell mit allen Overlays und Menüs
manifest.webmanifest    PWA-Manifest (Querformat, Vollbild)
sw.js                   Service Worker (Precache, Offline)
serve.ps1               Mini-Webserver für Windows
css/style.css           Design, Safe Areas, touch-action: none
icons/                  App-Icons (SVG, 192, 512, maskable, apple-touch)
js/
  main.js               Renderer, Game-Loop, Zustände (Menü / Spiel / Pause / Ergebnis)
  settings.js           Einstellungen + localStorage
  wheels.js             Handräder: Multitouch per Pointer Capture, Winkel-Kurbeln, Trägheit, Zeichnen
  camera.js             Stativ-Rig: Pan/Tilt (Tilt ±80°), Brennweite → Bildwinkel (Super 35)
  hud.js                Sucher: Framelines, Abdeckung, Fadenkreuz, Zielbereich, Richtungspfeil
  scene.js              Low-Poly-Welt (statische Geometrie gemerged) + Modelle Auto/Person/Drohne
  modes.js              Level-Definitionen, Pfade, Kurvenfolger mit Geschwindigkeitsprofil, Session
  score.js              Abweichung, Genauigkeit, Sterne, Bestwerte
  ui.js                 Menü, Levelauswahl, Einstellungen, Pause, Ergebnis, Objektiv-Bedienung
  vendor/three.module.min.js
```

## Technische Details

- **Multitouch**: Jedes Wheel ist ein eigenes Element mit `setPointerCapture`. Ein Finger bleibt an „seinem“ Wheel gebunden,
  auch wenn er das Rad verlässt. Ein zweiter Finger auf demselben Wheel wird ignoriert.
- **Kurbeln**: Pro Pointer-Event wird die Winkeländerung um die Radmitte (`atan2`) berechnet und aufaddiert.
  Nahe der Mitte (14 % des Radius) ist der Winkel instabil, dort wird nichts übertragen.
- **Trägheit**: Beim Loslassen wird die Winkelgeschwindigkeit aus den letzten 90 ms geschätzt
  und danach exponentiell gedämpft (`ω · e^(−k·t)`).
- **Brennweite**: Die Breite des Frameline-Rechtecks entspricht der Super-35-Sensorbreite (24,89 mm).
  Daraus ergibt sich der horizontale Bildwinkel `2·atan(24,89 / 2f)`, der in den vertikalen FOV der Three.js-Kamera umgerechnet wird.
- **Performance**: Die statische Welt ist pro Material zu einem Mesh zusammengeführt (ca. 50 Draw Calls, rund 30k Dreiecke).
  Die Pixel Ratio ist begrenzt, Lambert-Materialien mit Flat Shading, keine Echtzeitschatten.
  Die Wheels drehen sich per CSS-Transform und werden dafür nicht neu gezeichnet.
