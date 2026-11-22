# Was ist neu

Änderungen je Version (in der App nicht mehr angezeigt).

## Unveröffentlicht

- Dateinamen: „Spiel 0,3“ statt „Spalt 0,3“, wie in der Oberfläche („Spiel zwischen Stecker und Kupplung“). Beim Magnet-Adapter heißt das Spiel am Stutzen im Dateinamen jetzt „Stutzen 0,4“, damit es sich vom Spiel am Bajonett unterscheidet.
- *Größen* beim Stutzen: Die Tabelle „So wird das Rohrteil des Adapters“ zeigt die Werte mit Einheit (Ø29,3 mm statt 29,3).
- Der Kasten *Dichtung in der Kupplung* bleibt aufgeklappt, wenn man zwischen den Schritten wechselt.
- Anleitungsbilder *kontur-foto-pruefen* und *kontur-fertig* neu (Schreibweise R0,5).
- Technik: three.js (3D-Vorschau) liegt in einer eigenen Datei, die Startdatei ist dadurch 450 statt 1040 kB groß; keine Datei mehr über 800 kB. `tsconfig.json` ohne veraltete Einstellung (moduleResolution node10, mit TypeScript 7 nicht mehr erlaubt). README: Ø und R ohne Leerzeichen.
- **Maße der Dichtnut** im Schritt *Download*: Bei jedem Adapter mit Kupplung zeigt der Kasten *Dichtung in der Kupplung* eine maßstäbliche Skizze und die Maße für eine eigene Dichtung: Bohrung über der Nut, größter Ø der Nut, Rundung außen (R1,95), Höhe an der Bohrung, Abstand der Steckerspitze vom Boden (unter Sog und ohne Sog), Durchgang und Auflagefläche der Steckerspitze, dazu ein passender O-Ring und wie stark er zusammengedrückt wird. Bei zwei Kupplungen verschiedener Größe je eine Tabelle (bei der Magnet-Platte auch für die Kupplung in der Kappe eines Steckers). Hinweise: gedruckt weicht die Nut etwas ab (Probering drucken), genau nachmessen lässt sie sich im STEP-Modell; die Werte gelten für einen Stecker mit demselben Spiel. Die Lage der Steckerspitze ist am Modell nachgemessen (F32, Spiel 0,2 und 0,4). Wunsch aus dem Forum (bisher half nur, eine Kupplung aufzuschneiden).
- Neu: **Lippendichtung aus TPU** im Kasten *Dichtung in der Kupplung* (Schritt *Download*), als eigene Datei (3MF, STL, STEP) für alle Kupplungen des Adapters. Lippendichtung: Ein Fuß hält in der Hinterschneidung der Nut (unten 45°, 0,1 mm Luft zur Rundung), eine 0,8 mm dünne Lippe wächst innen schräg nach oben außen (mindestens 55° steil, druckt flach ohne Stützen) und legt sich von unten an die Steckerspitze. Die Außenluft kommt über den Spalt an der Bohrung unter die Lippe und drückt sie gegen den Stecker, unter Sog wird es also dichter; weil sich nur die Lippe biegt, lässt sich der Stecker leicht eindrehen. *Vorspannung der Lippe* 0,2–1,0 mm (Standard 0,5); die Lippe wird steiler, wenn sie sonst an die Bohrung käme. Skizze mit Ring, Maße und Gewicht (etwa 0,5–1,5 g). Am Modell geprüft: der Ring berührt die Kupplung nicht, der Stecker berührt nur die Lippe. Hinweise zu TPU (85A–95A), Einsetzen und Probedruck.
- Texte zur Dichtnut korrigiert: Der Sog zieht den Stecker kaum tiefer (bei 35 kPa etwa 35 N), maßgeblich ist, wie stark die Dichtung zusammengedrückt ist, wenn die Nasen oben in der Nut anliegen. Zeile E nennt den Spielraum der Nasen; die Skizze zeigt den Stecker in dieser Stellung.
- Schreibweise: „R0,5“ statt „R 0,5“ bei den Hinweisen zu gerundeten Ecken der eigenen Kontur, wie sonst Ø und R ohne Leerzeichen.
- Prüfung der Anleitungsbilder auf GitHub vergleicht zwei dort aufgenommene Stände (aktuell und Stand der letzten Bilder) statt direkt mit den eingecheckten Bildern; vorher meldete sie wegen kleiner Unterschiede beim Zeichnen 45 Bilder fälschlich als veraltet. GitHub-Actions auf aktuelle Versionen (setup-python v6, upload-artifact v6).

## 0.6.1

Fehlerbehebungen und Feinschliff nach 0.6.0.

- **Dichtnut der Kupplung frei** bei *Kupplung → Stutzen*, in der Freiform (Kupplung an A, B oder C, auch bei der Saugdüse mit Kupplung) und an der Magnet-Anschlussplatte (Kupplung und Kappe für einen Stecker). Bisher füllte dort eine 45°-Schräge die Dichtnut unter dem Rand auf (wie beim Maschinenadapter im Original), sodass keine Dichtung hineinpasste und Nebenluft gezogen wurde. Jetzt ist die Kupplung innen überall wie beim Schlauchadapter (*Kupplung ↔ Schlauch*): Eine Dichtung lässt sich unter den Rand klemmen. Hinweis aus dem Forum.
- **Schnitt in der Vorschau** schneidet jedes Teil durch seine eigene Achse. Bei der Magnet-Schnellkupplung wurde bisher nur ein Teil (oder nur ein Streifen der Platte) geschnitten, weil die gemeinsame Ebene in der Mitte aller Teile lag; jetzt Adapter, Kupplung bzw. Platte mit Anschlüssen (Ebene durch alle Anschlüsse) und Verschlusskappen je für sich. Auch bei den übrigen Adaptern liegt der Schnitt jetzt genau auf der Achse (vorher je nach Nasen und Beschriftung etwas daneben).
- Neue Prüfung `npm run docs:pruefen`: nimmt alle Anleitungsbilder neu auf und nennt die, die nicht mehr zur App passen. Läuft auch in den Tests auf GitHub (nur Warnung, die neuen Bilder liegen als Artefakt bei).
- Prüfungen im Browser (`test:ui`, `test:sketches`, `docs:bilder`, `docs:pruefen`) finden Chrome, Chromium oder Edge selbst (Linux, macOS, Windows, auch den Browser von `npx playwright install chromium`); ohne Browser gibt es eine Anleitung statt eines Absturzes. `docs:pruefen` prüft Python mit Pillow und numpy vor der Aufnahme.
- Vorschau: Regel für die Zeichenfläche war ungültig (`:global` in app.css) und wurde beim Build verworfen; Warnung beim Build weg.
- Anleitung: Abschnitte in derselben Reihenfolge wie die Karten in Schritt 1 (Freiform und eigene Kontur nach den Stutzen-Adaptern, dann Zubehör, Magnet-Schnellkupplung zuletzt). Bilder von Schritt 1 und der Magnet-Schnellkupplung neu (neues Symbol und Name der Karte *Gerät ↔ Kupplung/Stecker*, Kontrollkästchen im einheitlichen Stil).
- Hilfetext „Spiel am Zentrierbund“: Satzbau korrigiert. Anleitung: Satz zum Kurznamen auf den Karten (z. B. *MxxFyy*) verständlicher.

## 0.6.0

Entwicklungsumgebung und Programm haben jetzt denselben Stand: Was bisher nur unter `npm run dev` zu sehen war, gibt es überall.

- Neu: **Magnet-Schnellkupplung Ø100** für große Geräte mit 100-mm-Absaugung. Maschinenadapter mit Schraubklemme (M5 × 25 und selbstsichernde Mutter) und Schlauchkupplung mit Links- oder Rechtsgewinde halten über je 8 eingedruckte Neodym-Magnete (10 × 3, 12 × 5 oder 15 × 3 mm) zusammen, ein Bund zentriert sie. Die Druckhinweise nennen die Höhe der Druckpause zum Einlegen der Magnete. Druckt ohne Stützen. Die Kupplung selbst ist ein eigenes System; an osVAC neo schließt sie über die Platten an (nächster Punkt). Anleitung mit eigenem Abschnitt.
- Magnet-Schnellkupplung Ø100 mit **kleineren Schläuchen** und **Anschlüssen von osVAC neo**. Bei *Gerät ↔ Schlauch* lässt sich statt der Kupplung Ø100 eine Schlauchplatte für einen oder zwei kleinere Schläuche wählen (15–60 mm, Gewinde von osVAC neo, je Schlauch links oder rechts, eigene Gewindetabelle); jeder Schlauch dreht sich auf einem druckoptimierten Drehring, der Becher trägt vorne „osVAC neo“ und den Durchmesser, hinten die Lizenz. Neue Karte *Gerät ↔ Kupplung/Stecker*: Platte mit einem oder zwei Anschlüssen (Kupplung oder Stecker, Größen gemischt), fest ohne Drehring, wahlweise mit Verschlusskappe (Stopfen bzw. Kappe) als eigenem Teil. Zwei Anschlüsse nur mit genug Luft dazwischen (Bajonett 15 mm, zwei Stecker 12 mm zwischen den aufgesteckten Kupplungen, Schläuche 8 mm), zu große Kombinationen sperrt die App. Flache Platten wie beim Vorbild (die Platte schließt die Bohrung Ø97 selbst, Löcher nur unter den Anschlüssen; Ringnut für den Bund), mit der Kontaktfläche unten gedruckt, ohne Stützen; etwa 45–50 mm hoch. Neue Prüffälle in `test:islands` und `test:ui`. Beide Karten haben eigene Symbole (Schlauch bzw. Platte mit Kupplung und Stecker).
- Neu und Standard: **druckoptimierter Drehring** am Schlauchadapter (Kupplung ↔ Schlauch, Stecker ↔ Schlauch) und am Nebenluft-Regler. Er dreht sich direkt nach dem Druck, auch mit PETG: Alle Flächen, die beim Druck nach unten zeigen, sind mindestens 45° steil, nichts hängt flach über einem Spalt, frei beginnt nur die schmale Spitze eines Rings (0,65 mm über dem anderen statt 0,4 mm, rund 15 statt 700 mm²). Spiel an den senkrechten Dichtflächen wie eingestellt, an den Schrägen 0,15 mm mehr (mindestens 0,45 mm). Der Ring an der Kupplung bzw. am Gehäuse sitzt innen, der am Schlauchteil außen als Hülse; beim Stecker ↔ Schlauch ist die Unterkante des Gehäuses 45° statt 35° steil. Der Schlauchadapter mit Kupplung wird 0,5 mm länger. Neue Prüfung `npm run test:swivel`. *Wie Original* bleibt in „Passung“ wählbar, dann steht „Drehring wie Original“ im Dateinamen; „Passung auf Standard“ stellt druckoptimiert ein. Wer die App schon benutzt hat, behält seine gespeicherte Wahl. Beim Drehring wie im Original ist das Standard-Spiel wieder 0,3 mm wie im Original (vorher 0,35 mm); gespeicherte Werte bleiben.
- Neu: **Rechtsgewinde** für Schlauchadapter (Kupplung ↔ Schlauch, Stecker ↔ Schlauch) und Nebenluft-Regler, in *Größen* unter dem Schlauchfeld wählbar. Standard bleibt das Linksgewinde wie im Original. Das Rechtsgewinde ist das Spiegelbild des Originalgewindes (gleiche Steigung, gleicher Anschnitt und Auslauf); im Dateinamen steht dann „Rechtsgewinde“.
- Schlauchadapter und Nebenluft-Regler: In *Größen* steht unter dem Schlauchfeld eine kleine Tabelle mit den Durchmessern des Gewindes (Gewindegrund und Rippen innen, jeweils am Eingang und hinten). So sieht man vor dem Druck, ob ein Schlauch mit dickerer Wand noch hineingeht: Sein Außendurchmesser sollte höchstens so groß sein wie der Gewindegrund am Eingang (Anregung aus dem Forum).
- Nebenluft-Regler: **Nebenluft-Ring druckoptimiert**. An den schrägen Flanken oben und unten ist der Spalt 0,15 mm weiter als das eingestellte Spiel (mindestens 0,45 mm), an der Innenfläche bleibt es wie eingestellt. Der untere Bund ist außen unter dem Anfang des Rings etwas abgesenkt: Die erste Schicht des Rings, die frei beginnt, liegt gut 1 mm über dem Bund statt knapp 0,5 mm. Die Griffzähne wachsen unten schräg aus dem Ring, statt flach in der Luft zu beginnen. Die Mulden der Raste haben etwas mehr Luft. Der Regler wird dadurch 0,4 mm höher (bei 0,2 mm Spiel 0,7 mm). Neue Prüfung `npm run test:bleed`.
- Exporte: Als Ersteller steht jetzt **osVAC neo Baukasten** in 3MF (Designer), STEP (Autor) und im STL-Kopf, statt Ludo Kerz bei jedem Teil. Die Namensnennung „Basiert auf osVAC neo von Ludo Kerz …“ und die Lizenz stehen wie bisher in der Beschreibung.

## 0.5.5

- Drehring am Schlauchadapter und am Nebenluft-Regler: Standard-Spiel wieder 0,35 mm (vorher 0,45 mm). Testdrucke mit PETG haben gezeigt, dass 0,45 mm nicht besser löst, aber deutlich mehr Fäden zieht. Sitzt der Ring nach dem Druck fest, hilft die Drehring-Lösehilfe. Wer die App schon benutzt hat, behält seinen gespeicherten Wert; „Passung auf Standard zurücksetzen“ stellt 0,35 mm ein.
- Eingaben werden beim Neuladen oder Schließen sofort gespeichert. Vorher konnte eine Änderung der letzten halben Sekunde verloren gehen.

## 0.5.4

- Programm unter Linux und macOS: Beim Start kam oft die Meldung „Ein Teil des Adapters ließ sich mit diesen Maßen nicht berechnen“, obwohl alles stimmte. Ursache: WebKit startete den Rechen-Worker doppelt, eine Kopie ohne geladenen CAD-Kern. Der Worker ist jetzt eine einzige Datei.

## 0.5.3

- Lizenzen: Die Seite „Verwendete Bausteine und ihre Lizenzen“ nennt jetzt auch alles, was nur im installierten Programm steckt: 355 Rust-Bausteine (Tauri u. a.) mit ihren Lizenztexten zum Aufklappen, dazu NSIS (Windows-Installer) und die AppImage-Laufzeit. Vollständig auch in `lizenzen-programm.txt`.

## 0.5.2

- Downloads für alle: Jede Version erscheint jetzt auf der Release-Seite von GitHub (Windows, macOS, Linux), herunterladen geht ohne GitHub-Konto. Dazu Prüfsummen in `SHA256SUMS.txt`.
- Neue Anleitung, um den Baukasten ohne Installation im Browser zu nutzen (`docs/im-browser.md`). README auf den aktuellen Stand gebracht.

## 0.5.1

- Programm unter Linux und macOS: Der Knopf „Anleitung“ und der Link „Verwendete Bausteine und ihre Lizenzen“ öffnen wieder ein eigenes Fenster (vorher passierte nichts).

## 0.5.0

- Installer einheitlich benannt: `osVAC-neo-Baukasten-0.5.0-Windows-Setup.exe`, `…-macOS.dmg`, `…-Linux.AppImage`, `…-Linux.deb`. Tests auf GitHub nur noch von Hand und bei Versions-Tags.
- Standard-Spiel nach Testdruck (Nebenluft F32H36, PETG): Drehring am Schlauch 0,45 mm statt 0,3 mm (bei 9 mm Materialstärke an der Kupplung 0,35 mm, mehr geht dort nicht), Nebenluft-Ring 0,35 mm statt 0,4 mm. Einstellbereiche unverändert.
- Anleitung: Bilder öffnen groß in der Seite (Klick oder Esc schließt), auch im Programmfenster. `npm run build` erzeugt die Anleitung jedes Mal mit.
- Kopfzeile: Knöpfe beim Darüberfahren mit weißem Rahmen und leicht aufgehellter Fläche statt Rot. Kein Pfeil mehr hinter „osVAC neo“ im Download.
- Anleitung: „nach oben“ springt an den Seitenanfang; das Inhaltsverzeichnis zeigt farbig, wo man gerade liest.
- Kopfzeile: „Anleitung“ als Knopf mit Buch-Symbol und Rahmen (auf schmalen Handys nur das Buch). Der Link zu osvacneo.de ist jetzt im Download bei „Basiert auf osVAC neo“.
- Anleitung in der App: Link „Anleitung“ in der Kopfzeile öffnet eine bebilderte Seite mit Inhaltsverzeichnis zu allen Adapterarten und Einstellungen (auch offline, hell und dunkel). Quelle `docs/anleitung.md`, Bilder werden mit `npm run docs:bilder` automatisch aufgenommen.
- Druckbett: Filament je Adapter und zusammen.
- Filamentangabe bei schnellen Änderungen schneller: veraltete Messungen werden übersprungen. Das „?“ steht nicht mehr allein in der nächsten Zeile.
- Startdatei rund 120 kB kleiner: Kontur-Versatz, SVG/DXF-Leser und Zeichenfenster werden erst bei Bedarf geladen.
- Lizenz-Seite folgt der dunklen Ansicht.
- Rückfragen: Neben-Knopf (z. B. „Abbrechen“, „Behalten“) mit eigener Fläche, auch in der dunklen Ansicht gut zu erkennen. Die Rückfrage bei der Saugdüse sieht aus wie die anderen (gelber Streifen links) und rollt ins Bild.
- Einheitliche Knöpfe: Rückfrage bei der Saugdüse, „Datei wählen …“, „Foto wählen …“, „Zeichnen …“, „90° drehen“ und „Spiegeln“ jetzt rund wie im Rest der App (Haupt-Knopf rot, Neben-Knopf mit Rahmen). Kästchen wie „andersherum“ stehen bündig; Auswahlen neben Zahlenfeldern (z. B. „Schräge über“) sitzen auf gleicher Höhe. Farben für Fehler, OK und Warnung vereinheitlicht (auch in der dunklen Ansicht).
- Saugdüse: Die Rückfrage „Freiform ersetzen?“ erscheint direkt beim geklickten Knopf. Bei „Eigene Form“ stand sie vorher ganz unten außer Sicht, sodass der Klick scheinbar nichts tat.
- Freiform: „Düse“ an Ende B ist nicht mehr wählbar (von Hand ließ sie sich nicht sinnvoll formen). Sie erscheint nur noch, wenn eine Saugdüse mit „In der Freiform weiterbauen“ übernommen wurde.
- Eigene Kontur: „Selbst zeichnen“ als dritte Möglichkeit neben „Datei laden“ und „Am Foto nachzeichnen“. „Datei wählen …“ im Browser ohne Dateifilter (manche Browser unter Linux öffneten sonst kein Fenster; die Endung wird beim Lesen geprüft). Beim Nachzeichnen stehen „Foto wählen …“ und „Anderes Foto …“ unter dem Hilfetext.
- Filamentangabe wie im Slicer: Das Teil wird in 0,2-mm-Schichten geschnitten (3 Wände, 5 Lagen oben, 3 unten, 15 % Füllung). Statt einer Spanne steht jetzt eine Zahl, abgeglichen mit Bambu Studio (Nebenluft 78 g, M36F36 40 g, Flansch D63 64 g; Abweichung unter 1 %). Die Meter Filament passen jetzt zur Grammzahl.
- Freiform, Form „Eigene“: Solange noch keine Kontur da ist, kein „Fehler beim Berechnen“ mehr. Stattdessen blauer Hinweis an der Karte, Status „Kontur fehlt noch“, in der Vorschau „Sobald die Kontur angelegt ist, erscheint hier der Adapter“. Download bleibt bis dahin gesperrt.
- Helle und dunkle Ansicht: Umschalter (Mond/Sonne) ganz rechts in der Kopfzeile. Start immer hell, die Wahl wird gemerkt.
- Texte: Auslassungspunkte einheitlich mit (geschütztem) Leerzeichen, z. B. „Ordner wählen …“, „Wird berechnet …“.
- Filamentangabe genauer: Volumen und Außenfläche des ganzen Teils (alle Körper vereinigt, manifold-3d) statt der Summe der Einzelkörper; vorher bis zu 25 % zu hoch.
- Druckhinweis bei mitgedruckten Ringen (Schlauchadapter, Nebenluft-Regler): Slicer-Meldung „schwebende Bereiche“ bzw. „fliegender Träger“ ist gewollt, keine Stützen einschalten.
- Freiform: Form „Eigene“ für Stutzen, die zu keiner Grundform passen. Kontur aus SVG- oder DXF-Datei laden, am Foto nachzeichnen (mit Lineal als Maßstab) oder selbst zeichnen; drehen, spiegeln, auf das gemessene Maß bringen, mit Prüfliste. Geht überall, wo es eine Form gibt (Gerät aufgesteckt, eingesteckt, Flansch, Übergang, Absatz). Die Kontur gilt mit Blick auf den Stutzen (von vorne). Zeichnen: Rückgängig (Strg+Z), Zoom mit zwei Fingern und Knöpfen, Rückfrage vor dem Verwerfen. Eingesteckt: Hinweis, wenn schmale Stellen in der Wand verschwinden. SVG mit <use> wird gelesen.
- Neu unter Zubehör: „Drehring-Lösehilfe“ nach Odul. Halter für Kupplungen (FxxHyy) und/oder für Stecker (MxxHyy), beschriftet wie im Original (M32 bzw. F32), Größen frei, stehend ohne Stützen gedruckt (15–20 % Füllung reicht).
- Download: Ordner wählbar („Speichern in … Ordner wählen …“, Standard bleibt „Downloads“, wird gemerkt). Im Programm auf allen Systemen, dazu „Im Ordner zeigen“; im Browser in Chrome und Edge (dort speichert „Speichern“ in der Liste wieder in den gewählten Ordner), sonst legt der Browser den Ordner fest.
- Freiform: Was nicht geht, ist ausgegraut (Grund im Tooltip): zweiter Schieber, zweiter Abzweig, Schieber oder Abzweig bei Düse an Ende B und „Düse“ bei Schieber oder Abzweig.
- Nebenluft-Regler: „In der Freiform weiterbauen“ (mit Rückfrage) und „Zurück zum Nebenluft-Regler“; in der Freiform muss er beim Drucken senkrecht stehen (Fehler mit Vorschlag „anderes Ende nach unten“), schräg würden Stützen den Ring festschweißen.
- Dateinamen enthalten auch das Spiel am Nebenluft-Ring („Ring 0,5“) und der Schieberplatte in der Freiform („Platte 0,4“), wenn es vom Standard abweicht.
- Drehring am Schlauchadapter: Standard bleibt 0,3 mm wie im Original, mit deutlichem Hinweis für PETG (0,35–0,5 mm) in „Passung“ und in den Druckhinweisen.
- Vorschau: vor dem ersten Modell ganzes Druckbett mit „Vorschau wird berechnet …“; Web-App startet schneller (Hauptdatei ohne CAD-Bibliothek, 1,26 → 0,93 MB).
- test:islands prüft auch Stutzen-Adapter und Schieber einzeln.
- Schritt 1: Verbindungen in Gruppen (osVAC neo untereinander, An den Schlauch, An ein Gerät, Zubehör, Eigener Aufbau).
- Neu: Verbindung „Saugdüse“. Düsenart wählen (Rundrohr, Fugendüse, Fugendüse gebogen, Breitdüse, Polsterdüse), Anschluss (Stecker oder Kupplung, Ø), Länge, Biegung bis 45°, Öffnung, Schräge der Spitze und Wandstärke einstellen. Extras: Schutzring, Nut für eine Bürstenleiste. Gedruckt stehend mit dem Anschluss unten, ohne Stützen. „In der Freiform weiterbauen“ übernimmt die Düse als Bausteine.
- Freiform: Ende B kann eine Düsenspitze sein (gerade oder schräg, Schräge über die breite oder schmale Seite, mit denselben Extras).
- Neu: Verbindung „Nebenluft-Regler“: kommt direkt auf den Schlauch. Unten Schlauchteil mit Gewinde (H) und Drehring für den Schlauch wie beim Schlauchadapter, oben Kupplung (Standard) oder Stecker, dazwischen Rohr mit drei Fenstern und mitgedrucktem Nebenluft-Ring (um 60° drehen = auf bis zu, stufenlos, Raste bei auf und zu). Spiel beider Ringe in „Passung“. Nicht mehr als Baustein in der Freiform.
- Saugdüse: „Zurück zur Düse“ in der Freiform, wenn sie aus der Saugdüse übernommen wurde; „In der Freiform weiterbauen“ fragt nach, bevor es einen eigenen Freiform-Aufbau ersetzt.
- Nebenluft-Regler: oberer Bund wächst vom Rohr aus (hing vorher frei über dem Ring), Raste bei „auf“ und „zu“, Kerben über den Fenstern, Spiel am Drehring standardmäßig 0,4 mm, Übergang zur Kupplung passt sich dem Größenunterschied an (keine Stützen mehr bei z. B. M25 → F50).
- Schutzring an der Düse: Stufen quer zur Düse statt parallel zur schrägen Spitze (hing vorher auf der tiefen Seite frei); nach einem Bogen meldet die App, wenn er Stützen braucht.
- Stützen-Prüfung der Freiform: Kupplungen und Stecker, die nach einem Bogen oder am Abzweig schräg stehen, zählen jetzt mit.
- Neue Prüfung `npm run test:islands` (Schichten wie im Slicer, braucht Python mit trimesh/shapely), auch auf GitHub.

## 0.4.1

- Schieber (einzeln und in der Freiform): Auflagen für Schraubenkopf und Mutter 2,4 statt 1,5 mm dick und mit Brückenhilfe gedruckt (gerade Brücken statt Kreise in der Luft), dadurch sauberer und fester; Schrauben M3 × 14 statt × 12. Kleine Schieber (um Ø15) mit nur einer Schraube je Seite, sonst berühren sich die Muttern.

## 0.4.0

- Neu: Programm für Linux (AppImage und .deb). Downloads landen jetzt auch unter macOS und Linux im Ordner „Downloads“.
- Freiform: Übergänge, die so stark gebogen sind, dass sich die Wand innen überschneiden würde, werden erkannt (Fehler mit Vorschlag „Länge auf … setzen“). Stutzen-Adapter: Hinweis mit Vorschlag, wenn das schräge Stück zwischen Anschluss und Rohrteil steiler als 45° ist.
- Im Download-Schritt bei Lizenz und Version: „osVAC neo Baukasten von paddycodespy“ mit Link auf das GitHub-Profil.
- Neu: Schieber einzeln (Absperrschieber, Blast Gate) für Rohre Ø15–60 mm außen, aus Unterteil und Oberteil mit vier Schrauben M3 und Muttern. Beide Teile werden mit der Muffe nach unten ohne Stützen und ohne Brücke über einem Schlitz gedruckt. Die Platte ist 4 mm dick; Dichtlippen um die Bohrung drücken leicht auf die Platte (gegen Falschluft, die Platte bleibt durch Reibung stehen). Das Rohr wird beidseitig in eine Muffe mit Anschlag gesteckt. Befestigung: ohne, Wandplatte mit vier Senklöchern, Schlüssellöcher oder eigener Wandhalter, alle für Rohr senkrecht oder waagerecht (Schlüssellöcher mit eigener Wahl der Lage); Wandabstand bis Rohrmitte wählbar (bis 50 mm mehr als direkt an der Wand). Spiel am Rohr und der Platte in „Passung“.
- Freiform: Schieber als neuer Baustein (rund, Richtung der Platte wählbar), Vorlage „Absperrschieber“. Wie beim Schieber einzeln verschraubt mit Dichtlippen; der Adapter wird am Schieber in zwei Teilen gedruckt, die jeweils auf ihrem Ende stehen. Die Platte ist ein eigenes Teil, wird flach daneben gedruckt, beide Enden sind Anschläge.
- Freiform: Abzweig als neuer Baustein (Y- oder T-Stück, Winkel 30–90°) mit eigenem Ende C (Kupplung, Stecker oder Gerät), Vorlage „Y-Abzweig 45°“. Innen ausgerundete Einmündung, ab 50° auch gebogen (Bogen-T) für bessere Strömung.
- Flansch: Lochbild „Dreieck“ (abgerundetes Dreieck mit 3 Löchern).
- Stützen-Prüfung auch für Stutzen-Adapter und Schieber (eigene Teile, kleine Stellen wie Lochdecken zählen nicht); Messskizze und eingravierter Ø beim Schieber; Spiel der Schieberplatte auch in der Freiform; Schieberplatte liegt in der Freiform vor dem Adapter (kleinere Grundfläche); eigene Formstücke mit gröberem Netz (0,02 mm, kleinere Dateien); Fehler aus dem Aufbau erscheinen nicht mehr doppelt.

## 0.3.0

- Neuer Name „osVAC neo Baukasten“ mit eigenem Symbol (vorher „osVAC neo Konfigurator“). Das Programm hat eine neue App-Kennung und installiert sich neben dem alten; das alte bitte deinstallieren. Der zuletzt bearbeitete Adapter wird im Programm nicht übernommen.
- Freiform: Flansch zum Anschrauben an Ende B. Löcher automatisch oder nach Maß (rechteckig mit Löchern je Seite oder rund mit Lochkreis), Nut für Dichtband 6, 9 oder 10 mm, Skizze, neue Vorlage „Flansch am Gehäuse“, Brim-Hinweis bei großen Platten.
- Meldungen nennen das Feld und den Grenzwert; ein Knopf „… auf … setzen“ übernimmt den passenden Wert, das Feld ist markiert.
- Die Druckhilfe gilt je Verbindung statt für die ganze App.
- Das Mehrfach-Druckbett bleibt nach dem Schließen oder Neuladen erhalten.
- Hinweise im Download führen mit einem Klick zum passenden Schritt.
- Vorschau: kein Flackern und keine schwarzen Striche mehr im Schnitt.

## 0.2.0

- Erste Testversion für Windows und Mac mit Freiform-Adaptern aus Bausteinen, Extras am Geräteanschluss und Stutzen-Adaptern.
