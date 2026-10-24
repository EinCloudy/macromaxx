# MacroMaxx

Eine JavaScript-/Electron-App für Elgato Stream Decks: visueller Editor, Profile, Ordner, Aktionsketten und eigene Plugins. Deutsche Oberfläche, helles und dunkles Design, lokale Speicherung.

## Starten

Voraussetzung: **Node.js 22.12+**, npm und eine grafische Desktop-Sitzung.

```sh
npm install
npm start
```

Bei npm-Versionen mit blockierten Installationsskripten die Skripte für `electron`, `esbuild`, `node-hid` und `@julusian/jpeg-turbo` freigeben (`npm install-scripts approve …`) und `npm rebuild` ausführen. Die im Projekt gespeicherten Freigaben gelten für die festgeschriebenen Versionen.

```sh
npm run dev    # Vite mit Hot Reload + Electron
npm test       # Kernlogik, echte lokale HTTP-Anfragen, Plugin-Prozess und OBS-Testserver
npm run pack   # Entpackte Desktop-App in release/
npm run dist   # Installer für die aktuelle Plattform
```

Linux: AppImage. Windows: NSIS. macOS: dmg. Für die jeweiligen Plattformen auf dem entsprechenden Betriebssystem bauen; Signierung und Notarisierung sind nicht eingerichtet.

## Bedienung

1. Aktion aus der rechten Bibliothek auf eine Taste ziehen oder freie Taste anklicken und eine Aktion auswählen.
2. **Eigenschaften** öffnen: Beschriftung, Schriftgröße, Icon, Farbe, eigenes Bild und Aktionsparameter einstellen. Die Schriftgröße ist pro Taste von 10 bis 32 einstellbar – per Regler oder Zahlenfeld, mit direkter Vorschau und Übertragung auf das Deck. Unter **Einstellungen → Schrift & Beschriftung** lässt sich die globale Standardgröße ändern (Werkseinstellung 16). Neue Tasten sowie vorhandene Tasten ohne eigene Größenangabe übernehmen diesen Wert automatisch, auch in Unterordnern und für die Zurück-Taste. Eigene Größen bleiben erhalten; „Standard“ in den Tasteneigenschaften entfernt die individuelle Größenangabe und aktiviert wieder die Vererbung. Lange Beschriftungen werden auf bis zu zwei Zeilen umbrochen und bei Bedarf mit „…“ gekürzt. Globale und individuelle Einstellungen bleiben beim Duplizieren bzw. Import/Export erhalten.
3. **Testen** oder die Hardwaretaste drücken. Ergebnisse stehen unter **Aktivitäten**.
4. Aktionen in den Eigenschaften zu einer Kette ergänzen und umsortieren. Erneutes Auslösen stoppt eine laufende Kette. Mit Wartezeiten lassen sich Programme und Workflows koordinieren.
5. **Langer Druck** kann separat belegt werden (ab 600 ms). Nicht belegte lange Drücke verwenden die kurze Belegung. Aktionen werden beim Loslassen ausgelöst.
6. Ordner per Doppelklick oder Hardwaretaste öffnen. Die Zurück-Taste führt eine Ebene zurück und lässt sich wie andere Tasten per Drag-and-drop verschieben. Ihre Position wird pro Ordner gespeichert; beim Ziehen auf eine belegte Taste werden beide Plätze getauscht. Neue und bestehende Ordner beginnen standardmäßig oben links. Profile links verwalten; Profilwechsel können ebenfalls auf Tasten liegen.

Tasten können per Drag-and-drop getauscht werden. Rückgängig/Wiederholen über die Toolbar oder Strg+Z / Strg+Umschalt+Z. Profilverwaltung über das Drei-Punkte-Menü. Änderungen werden automatisch gespeichert; USB-Bilder und Helligkeit live übertragen.

Beim App-Start läuft auf dem ersten verbundenen Deck eine kurze violette Lichtwelle von der Mitte nach außen. Das Raster wird automatisch berücksichtigt: Beim 15-Tasten-Deck beginnt sie auf der mittleren Taste, beim XL symmetrisch um die vier zentralen Tasten. Anschließend erscheint die aktuelle Belegung. Ein Tastendruck überspringt die Animation; Ordnerwechsel und erneutes Verbinden spielen sie nicht erneut ab.

Beim tatsächlichen Beenden läuft dieselbe Lichtwelle rückwärts: von außen zurück zur Mitte. Anschließend blenden die mittleren Tasten und der verbleibende Hintergrundglanz über eine kurze zusätzliche Ausblendphase vollständig bis Schwarz aus. Danach wird das Gerät freigegeben, ohne erneut das Geräte-Logo einzublenden. Das gilt für „Beenden“ im Tray, den Beenden-Button und das Schließen des Fensters bei deaktiviertem Tray-Betrieb. Minimieren in den Tray spielt keine Endanimation ab. Während der Endwelle werden keine Tastenaktionen mehr ausgelöst; wiederholte Beenden-Anforderungen starten die Animation nicht erneut. Start- und Endwelle bleiben unabhängig von den optionalen Icon-/Ordner-Effekten aktiv.

Unter **Einstellungen → Deck-Animationen** lassen sich zwei zusätzliche Effekte unabhängig deaktivieren: **Ordnerübergänge** (kurzes Überblenden und seitliches Einschieben beim Öffnen/Verlassen eines Ordners, ca. 240 ms Wiedergabe) und **Icons nach Start einblenden** (sanftes Einblenden der Belegung von der Mitte nach außen nach der Startwelle, ca. 320 ms). Beide sind standardmäßig aktiviert, auch für bisherige Workspaces. Die Einstellungen werden gespeichert und mit exportiert. Die Startwelle bleibt immer aktiv. Tastendrücke überspringen laufende Effekte; schnelle Navigation bricht den alten Übergang ab und zeigt die aktuelle Zielseite. Ohne die optionalen Effekte werden weiterhin direkt die zwischengespeicherten Icons angezeigt.

## Aktionen

- **Hotkey:** Kombination aufnehmen oder `CTRL+SHIFT+M` eingeben. Auch Funktionstasten, Pfeiltasten, `META`, `SPACE`, `ENTER`, `PLUS`, `MINUS` etc. Drücken/Loslassen separat möglich (Linux/Windows). Gehaltene Tasten werden beim normalen Beenden und bei „Alle stoppen“ freigegeben.
- **Website:** HTTP(S)- oder mailto-Adresse im Standardprogramm öffnen.
- **Programm/Datei:** absoluten Pfad auswählen. Unter Linux werden ausführbare Dateien direkt gestartet, `.desktop`-Dateien über `gio launch` und andere Dateien/Verzeichnisse über das Standardprogramm geöffnet. `~` wird zum Home-Verzeichnis aufgelöst.
- **Text:** Text in die Zwischenablage kopieren und einfügen. Der Zwischenablageinhalt wird dabei ersetzt. Zum Testen eine Wartezeit vorschalten, um die Zielanwendung zu fokussieren.
- **Medien:** Play/Pause, Titelwechsel, Lautstärke und Stummschaltung. Unter Linux `playerctl` für Player, `wpctl` oder `pactl` für Lautstärke. Windows verwendet Medientasten. macOS-Lautstärke über AppleScript; globale Medien-Play/Pause-Tasten sind dort noch nicht implementiert.
- **Webhook:** GET/POST/PUT/PATCH/DELETE/HEAD, JSON-Header, freier Body. JSON-Anfragen benötigen z. B. `{"Content-Type":"application/json"}`. HTTP-Fehler erscheinen im Protokoll. Timeout 15 Sekunden. Auch lokale Endpoints werden unterstützt.
- **OBS Studio:** Szenenwechsel, Aufnahme/Streaming umschalten, Audioquelle stummschalten. Live-Status auf der Taste. OBS 28+ mit aktiviertem WebSocket-Server (Standardport 4455). Verbindung unter Einstellungen herstellen.
- **Plugins:** [Schnittstelle und Beispiel](docs/PLUGINS.md).

## Plattform-Einrichtung

### Linux / KDE Wayland

Unter **Einstellungen → Tastatur & Geräte → Tastatur freigeben** den nativen Desktop-Dialog bestätigen. Die App fordert ausschließlich Tastaturzugriff an. Die Freigabe gilt für die laufende App-Sitzung und kann vom Desktop widerrufen werden.

Benötigt: `python3`, Python-D-Bus, PyGObject, `libei`, `libxkbcommon`, ein implementiertes RemoteDesktop-Portal und das passende Desktop-Backend (bei KDE `xdg-desktop-portal-kde`). Moderne Desktops erhalten Eingaben über EIS/libei; das aktuelle Tastaturlayout kommt direkt vom Compositor. Ältere Portale können die D-Bus-Eingabemethoden verwenden.

```sh
# Debian / Ubuntu
sudo apt install python3-dbus python3-gi playerctl libei1 libxkbcommon0
# Arch
sudo pacman -S python-dbus python-gobject playerctl libei libxkbcommon
```

Wenn der USB-Zugriff scheitert: **USB-Zugriff einrichten** installiert nach Passwortabfrage eine udev-Regel für Elgato-HID-Geräte. Anschließend das Deck ggf. neu verbinden. Die Regel liegt unter `/etc/udev/rules.d/70-macromaxx-streamdeck.rules`. Bereits vorhandene Zugriffsrechte reichen aus; die Installation ist dann unnötig. Bei belegtem Gerät andere Stream-Deck-Software schließen.

### Linux / X11

`xdotool` für Hotkeys installieren. Bei einer Wayland-Sitzung wird absichtlich das Portal verwendet, damit auch native Wayland-Anwendungen erreicht werden.

### Windows

Tastatureingaben über Windows `keybd_event` (PowerShell-Helfer). Anwendungen mit erhöhten Rechten können Eingaben von einer normal gestarteten App blockieren.

### macOS

Bedienungshilfen für MacroMaxx bzw. die Entwicklungsumgebung freigeben. Tastenkombinationen über System Events. Gedrückt-halten/Loslassen und einige Sondertasten werden dort noch nicht unterstützt und als Fehler gemeldet.

## Daten und Export

`workspace.json` im Electron-Benutzerdatenverzeichnis (Linux üblicherweise `~/.config/MacroMaxx/`, abhängig von Electron/App-Name auch `~/.config/macromaxx/`). Die letzte gültige Version liegt als `workspace.json.bak` daneben. Schreibvorgänge erfolgen serialisiert über eine temporäre Datei; bei beschädigter Hauptdatei wird die Sicherung gelesen. Aktivitätsprotokolle bleiben im Arbeitsspeicher.

Import/Export unter Einstellungen. Ein Import ersetzt den Workspace nach Bestätigung. Icons sind eingebettet. OBS-Passwörter und Webhook-Zugangsdaten werden lokal gespeichert und sind **auch in Exportdateien enthalten**.

Die App verwaltet ein aktives USB-Deck; bei mehreren angeschlossenen Geräten kann das Zielgerät ausgewählt werden. Unterstützt werden die von `@elgato-stream-deck/node` erkannten Tastengeräte. Encoder, Touchleisten und gerätespezifische Zusatzfunktionen sind nicht im Editor abgebildet. Beim Wechsel auf kleinere Geräte bleiben außerhalb des sichtbaren Rasters liegende Tasten im Profil erhalten.

## Projektaufbau

```text
electron/     Hauptprozess, Preload, Geräte, Aktionen, Portal und Plugins
src/          React-Editor und Darstellung der Hardware-Tastenbilder
shared/       Datenmodell und Importvalidierung
plugins/      Mitgeliefertes Beispielplugin
tests/        Node-Test-Suite
docs/         Plugin-Dokumentation
```

Die Oberfläche kann separat über `npx vite --host 127.0.0.1` als Browser-Vorschau gestartet werden. Dort werden Profile im Local Storage gespeichert; native Aktionen sind nur in Electron verfügbar.

Unabhängiges Projekt, keine offizielle Elgato-Software.
