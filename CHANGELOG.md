# Was ist neu

Änderungen je Version (in der App nicht mehr angezeigt).

## 0.5.0

- Freiform: Form „Eigene“ für Stutzen, die zu keiner Grundform passen. Kontur aus SVG- oder DXF-Datei laden, am Foto nachzeichnen (mit Lineal als Maßstab) oder selbst zeichnen; drehen, spiegeln, auf das gemessene Maß bringen, mit Prüfliste. Geht überall, wo es eine Form gibt (Gerät aufgesteckt, eingesteckt, Flansch, Übergang, Absatz). Die Kontur gilt mit Blick auf den Stutzen (von vorne). Zeichnen: Rückgängig (Strg+Z), Zoom mit zwei Fingern und Knöpfen, Rückfrage vor dem Verwerfen. Eingesteckt: Hinweis, wenn schmale Stellen in der Wand verschwinden. SVG mit <use> wird gelesen.
- Neu unter Zubehör: „Drehring-Lösehilfe“ nach Odul. Halter für Kupplungen (FxxHyy) und/oder für Stecker (MxxHyy), beschriftet wie im Original (M32 bzw. F32), Größen frei, stehend ohne Stützen gedruckt (15–20 % Füllung reicht).
- Download: Ordner wählbar („Speichern in … Ordner wählen…“, Standard bleibt „Downloads“, wird gemerkt). Im Programm auf allen Systemen, dazu „Im Ordner zeigen“; im Browser in Chrome und Edge (dort speichert „Speichern“ in der Liste wieder in den gewählten Ordner), sonst legt der Browser den Ordner fest.
- Freiform: Was nicht geht, ist ausgegraut (Grund im Tooltip): zweiter Schieber, zweiter Abzweig, Schieber oder Abzweig bei Düse an Ende B und „Düse“ bei Schieber oder Abzweig.
- Nebenluft-Regler: „In der Freiform weiterbauen“ (mit Rückfrage) und „Zurück zum Nebenluft-Regler“; in der Freiform muss er beim Drucken senkrecht stehen (Fehler mit Vorschlag „anderes Ende nach unten“), schräg würden Stützen den Ring festschweißen.
- Dateinamen enthalten auch das Spiel am Nebenluft-Ring („Ring 0,5“) und der Schieberplatte in der Freiform („Platte 0,4“), wenn es vom Standard abweicht.
- Drehring am Schlauchadapter: Standard bleibt 0,3 mm wie im Original, mit deutlichem Hinweis für PETG (0,35–0,5 mm) in „Passung“ und in den Druckhinweisen.
- Vorschau: vor dem ersten Modell ganzes Druckbett mit „Vorschau wird berechnet…“; Web-App startet schneller (Hauptdatei ohne CAD-Bibliothek, 1,26 → 0,93 MB).
- test:islands prüft auch Stutzen-Adapter und Schieber einzeln.
- Schritt 1: Verbindungen in Gruppen (osVAC neo untereinander, An den Schlauch, An ein Gerät, Zubehör, Eigener Aufbau).
- Neu: Verbindung „Saugdüse“. Düsenart wählen (Rundrohr, Fugendüse, Fugendüse gebogen, Breitdüse, Polsterdüse), Anschluss (Stecker oder Kupplung, Ø), Länge, Biegung bis 45°, Öffnung, Schräge der Spitze und Wandstärke einstellen. Extras: Schutzring, Nut für eine Bürstenleiste. Gedruckt stehend mit dem Anschluss unten, ohne Stützen. „In der Freiform weiterbauen“ übernimmt die Düse als Bausteine.
- Freiform: Ende B kann eine Düsenspitze sein (gerade oder schräg, Schräge über die breite oder schmale Seite, mit denselben Extras).
- Neu: Verbindung „Nebenluft-Regler“: Zwischenstück mit Stecker unten und Kupplung oben, drei Fenster und ein mitgedruckter Drehring (um 60° drehen = auf bis zu, stufenlos). Für alle Düsen und Werkzeuge. Spiel am Drehring in „Passung“ (0,2–0,6 mm). In der Freiform als Baustein „Nebenluft“.
- Saugdüse: „Zurück zur Düse“ in der Freiform, wenn sie aus der Saugdüse übernommen wurde; „In der Freiform weiterbauen“ fragt nach, bevor es einen eigenen Freiform-Aufbau ersetzt.
- Nebenluft-Regler: oberer Bund wächst vom Rohr aus (hing vorher frei über dem Ring), Raste bei „auf“ und „zu“, Kerben über den Fenstern, Spiel am Drehring standardmäßig 0,4 mm, Übergang zur Kupplung passt sich dem Größenunterschied an (keine Stützen mehr bei z. B. M25 → F50).
- Schutzring an der Düse: Stufen quer zur Düse statt parallel zur schrägen Spitze (hing vorher auf der tiefen Seite frei); nach einem Bogen meldet die App, wenn er Stützen braucht.
- Stützen-Prüfung der Freiform: Kupplungen und Stecker, die nach einem Bogen oder am Abzweig schräg stehen, zählen jetzt mit.
- Neue Prüfung `npm run test:islands` (Schichten wie im Slicer, braucht Python mit trimesh/shapely), auch auf GitHub.

## 0.4.1

- Schieber (einzeln und in der Freiform): Auflagen für Schraubenkopf und Mutter 2,4 statt 1,5 mm dick und mit Brückenhilfe gedruckt (gerade Brücken statt Kreise in der Luft), dadurch sauberer und fester; Schrauben M3 × 14 statt × 12. Kleine Schieber (um Ø 15) mit nur einer Schraube je Seite, sonst berühren sich die Muttern.

## 0.4.0

- Neu: Programm für Linux (AppImage und .deb). Downloads landen jetzt auch unter macOS und Linux im Ordner „Downloads“.
- Freiform: Übergänge, die so stark gebogen sind, dass sich die Wand innen überschneiden würde, werden erkannt (Fehler mit Vorschlag „Länge auf … setzen“). Stutzen-Adapter: Hinweis mit Vorschlag, wenn das schräge Stück zwischen Anschluss und Rohrteil steiler als 45° ist.
- Im Download-Schritt bei Lizenz und Version: „osVAC neo Baukasten von paddycodespy“ mit Link auf das GitHub-Profil.
- Neu: Schieber einzeln (Absperrschieber, Blast Gate) für Rohre Ø 15–60 mm außen, aus Unterteil und Oberteil mit vier Schrauben M3 und Muttern. Beide Teile werden mit der Muffe nach unten ohne Stützen und ohne Brücke über einem Schlitz gedruckt. Die Platte ist 4 mm dick; Dichtlippen um die Bohrung drücken leicht auf die Platte (gegen Falschluft, die Platte bleibt durch Reibung stehen). Das Rohr wird beidseitig in eine Muffe mit Anschlag gesteckt. Befestigung: ohne, Wandplatte mit vier Senklöchern, Schlüssellöcher oder eigener Wandhalter, alle für Rohr senkrecht oder waagerecht (Schlüssellöcher mit eigener Wahl der Lage); Wandabstand bis Rohrmitte wählbar (bis 50 mm mehr als direkt an der Wand). Spiel am Rohr und der Platte in „Passung“.
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
