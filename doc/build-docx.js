const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const {
  Document, Packer, Paragraph, TextRun, Tab, ImageRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle, LevelFormat,
  TableOfContents, Footer, PageNumber, PageBreak,
} = require('docx');

const SRC_DIR = path.join(__dirname, '..');   /* Repo-Wurzel */
const OUT = path.join(SRC_DIR, 'USSDEMO-Dokumentation.docx');

/* ------------------------------------------------------------------ */
/* Diagramme (SVG -> PNG)                                              */
/* ------------------------------------------------------------------ */

const RAMP = {
  gray:   { fill: '#F1EFE8', stroke: '#5F5E5A', title: '#2C2C2A', sub: '#5F5E5A' },
  purple: { fill: '#EEEDFE', stroke: '#534AB7', title: '#3C3489', sub: '#534AB7' },
  teal:   { fill: '#E1F5EE', stroke: '#0F6E56', title: '#085041', sub: '#0F6E56' },
  coral:  { fill: '#FAECE7', stroke: '#993C1D', title: '#712B13', sub: '#993C1D' },
};
const FONT = 'font-family="Segoe UI, Arial, sans-serif"';

function box(x, y, w, color, title, sub) {
  const c = RAMP[color], cx = x + w / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="56" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1"/>` +
    `<text x="${cx}" y="${y + 23}" text-anchor="middle" ${FONT} font-size="14" font-weight="600" fill="${c.title}">${title}</text>` +
    `<text x="${cx}" y="${y + 43}" text-anchor="middle" ${FONT} font-size="12" fill="${c.sub}">${sub}</text>`;
}
function arrow(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5F5E5A" stroke-width="1.5" marker-end="url(#arrow)"/>`;
}
function legend(x, y) {
  const item = (dx, color, label) =>
    `<rect x="${x + dx}" y="${y}" width="12" height="12" rx="2" fill="${RAMP[color].fill}" stroke="${RAMP[color].stroke}"/>` +
    `<text x="${x + dx + 20}" y="${y + 10}" ${FONT} font-size="12" fill="#444441">${label}</text>`;
  return item(0, 'purple', 'Prozesse') + item(100, 'teal', 'Threads') + item(200, 'coral', 'Mutex');
}
function svg(h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 ${h}" width="680" height="${h}">` +
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">` +
    `<path d="M2 1L8 5L2 9" fill="none" stroke="#5F5E5A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>` +
    `<rect width="680" height="${h}" fill="#FFFFFF"/>` + body + `</svg>`;
}

const flowSvg = svg(760,
  box(60, 40, 280, 'gray', 'main()', 'Argument --spawn-child?') +
  arrow(340, 68, 392, 68) +
  box(400, 40, 240, 'purple', 'Kindzweig: child_work()', 'nur mit --spawn-child') +
  arrow(200, 96, 200, 132) +
  box(60, 140, 280, 'coral', 'Zwei Mutexe anlegen', 'pthread_mutex_init()') +
  arrow(200, 196, 200, 232) +
  box(60, 240, 280, 'purple', 'Kind A starten', 'pipe(), fork()') +
  arrow(340, 268, 392, 268) +
  box(400, 240, 240, 'purple', 'Kindprozess A', '10, 20 … 50 in Pipe A') +
  arrow(200, 296, 200, 332) +
  box(60, 340, 280, 'purple', 'Kind B starten', 'pipe(), spawnp() mit fd_map') +
  arrow(340, 368, 392, 368) +
  box(400, 340, 240, 'purple', 'Kindprozess B', '100 … 500 in Pipe B') +
  arrow(200, 396, 200, 432) +
  box(60, 440, 280, 'teal', 'Fünf Threads starten', 'pthread_create()') +
  arrow(200, 496, 200, 532) +
  box(60, 540, 280, 'gray', 'Einsammeln', 'pthread_join(), waitpid()') +
  arrow(200, 596, 200, 632) +
  box(60, 640, 280, 'gray', 'Summe prüfen, Mutexe freigeben', 'pthread_mutex_destroy()') +
  legend(60, 724));

const dataSvg = svg(500,
  box(40, 40, 180, 'purple', 'Kindprozess A', 'fork(): 10 … 50') +
  box(240, 40, 180, 'purple', 'Kindprozess B', 'spawn(): 100 … 500') +
  arrow(130, 96, 130, 142) + arrow(330, 96, 330, 142) +
  box(40, 150, 180, 'teal', 'Reader-Thread fork', 'liest Pipe A bis EOF') +
  box(240, 150, 180, 'teal', 'Reader-Thread spawn', 'liest Pipe B bis EOF') +
  box(440, 150, 200, 'teal', '3 Rechen-Threads', 'je 20000 Werte') +
  arrow(130, 206, 130, 262) + arrow(330, 206, 330, 262) + arrow(540, 206, 540, 262) +
  box(40, 270, 600, 'coral', 'add_result() mit shared.lock', 'trylock/lock, total += wert, unlock') +
  arrow(340, 326, 340, 372) +
  box(190, 380, 300, 'gray', 'shared.total, updates, contended', 'ein Thread gleichzeitig') +
  legend(40, 464));

function renderPng(svgText, name) {
  const png = new Resvg(svgText, {
    fitTo: { mode: 'width', value: 1360 },
    font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
  }).render().asPng();
  fs.writeFileSync(path.join(__dirname, name), png);
  return png;
}
const flowPng = renderPng(flowSvg, 'ablauf.png');
const dataPng = renderPng(dataSvg, 'datenfluss.png');

/* ------------------------------------------------------------------ */
/* Bausteine                                                           */
/* ------------------------------------------------------------------ */

const CONTENT_W = 9638;            /* A4 (11906) minus 2 x 1134 Rand */
const MONO = 'Consolas';

/* `code` im Fliesstext wird in Festbreitenschrift gesetzt */
function runs(text) {
  return text.split('`').map((part, i) =>
    i % 2 ? new TextRun({ text: part, font: MONO, size: 20 }) : new TextRun(part)).filter(Boolean);
}
const P = (text) => new Paragraph({ children: runs(text), spacing: { after: 120 } });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const BULLET = (text) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(text), spacing: { after: 60 } });
const STEP = (text) => new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: runs(text), spacing: { after: 80 } });
const PAGEBREAK = () => new Paragraph({ children: [new PageBreak()] });

function codeLine(line) {
  const children = [];
  line.split('\t').forEach((part, i) => {
    if (i > 0) children.push(new Tab());
    if (part) children.push(part);
  });
  return new Paragraph({
    style: 'Code',
    shading: { type: ShadingType.CLEAR, fill: 'F3F3F1', color: 'auto' },
    children: [new TextRun({ children, font: MONO, size: 17 })],
  });
}
function codeBlock(text) {
  const lines = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  return lines.map(codeLine);
}
const codeFile = (name) => codeBlock(fs.readFileSync(path.join(SRC_DIR, name), 'utf8'));

function figure(png, h, caption, alt) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120 }, keepNext: true,
      children: [new ImageRun({ type: 'png', data: png, transformation: { width: 600, height: Math.round(h * 600 / 680) },
        altText: { title: caption, description: alt, name: caption } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: caption, italics: true, size: 19, color: '555555' })] }),
  ];
}

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
function table(widths, header, rows) {
  const cell = (text, w, isHeader) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: BORDERS,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: isHeader ? { type: ShadingType.CLEAR, fill: 'E6E4DC', color: 'auto' } : undefined,
    children: [new Paragraph({ children: isHeader ? [new TextRun({ text, bold: true })] : runs(text) })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((t, i) => cell(t, widths[i], true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, widths[i], false)) })),
    ],
  });
}
const SPACER = () => new Paragraph({ spacing: { after: 160 }, children: [] });

/* ------------------------------------------------------------------ */
/* Inhalt                                                              */
/* ------------------------------------------------------------------ */

const sample = fs.readFileSync(path.join(__dirname, 'sample-output.txt'), 'utf8');

const body = [
  new Paragraph({ spacing: { before: 600, after: 120 },
    children: [new TextRun({ text: 'USSDEMO', bold: true, size: 56, color: '3C3489' })] }),
  new Paragraph({ spacing: { after: 120 },
    children: [new TextRun({ text: 'fork(), spawn() und Thread-Koordination mit pthread-Mutexen unter z/OS UNIX System Services', size: 30 })] }),
  new Paragraph({ spacing: { after: 480 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '534AB7', space: 8 } },
    children: [new TextRun({ text: 'Programmdokumentation · Stand 25.09.2026', color: '555555' })] }),

  new TableOfContents('Inhalt', { hyperlink: true, headingStyleRange: '1-2' }),
  PAGEBREAK(),

  /* 1 */
  H1('1 Überblick'),
  P('`ussdemo` ist ein Beispielprogramm in C für z/OS UNIX System Services. Es zeigt in einem zusammenhängenden Ablauf drei Dinge: die Erzeugung eines Kindprozesses mit `fork()`, die Erzeugung eines zweiten Kindprozesses mit dem z/OS-Service `spawn()` (hier in der Variante `spawnp()`), und die Koordination paralleler Threads über Mutexe, die mit `pthread_mutex_init()` angelegt werden.'),
  P('Die beiden Kindprozesse liefern Zahlen über je eine Pipe an den Elternprozess. Dort lesen zwei Reader-Threads die Pipes, während drei Rechen-Threads eigene Werte erzeugen. Alle fünf Threads addieren ihre Werte auf dieselbe Summe. Der Zugriff darauf ist durch einen Mutex serialisiert. Am Ende vergleicht das Programm die Summe mit dem rechnerisch erwarteten Wert und meldet `OK` oder `FEHLER`.'),
  P('Zusätzlich führt das Programm Buch darüber, wie oft ein Thread auf den Mutex warten musste und welcher Thread ihn gerade hält. POSIX bietet dafür keine Abfragefunktion (siehe Kapitel 6).'),
  H2('1.1 Dateien'),
  table([2600, 7038], ['Datei', 'Inhalt'], [
    ['`ussdemo.c`', 'Quelltext des Programms (Anhang A)'],
    ['`Makefile`', 'Übersetzung mit `make`, ohne GNU-Erweiterungen, für z/OS UNIX und Linux (Anhang B)'],
    ['`USSDEMO.jcl`', 'Batch-Job: Übersetzen und Ausführen über BPXBATCH (Anhang C)'],
  ]),
  SPACER(),
  H2('1.2 Teststand'),
  P('Das Programm wurde auf z/OS 2.4 mit `xlc` (z/OS XL C/C++, lokale Konfiguration `cc.cfg`) übersetzt und in der z/OS UNIX Shell mit `_BPX_SHAREAS=YES` ausgeführt. Beide Kindprozesse endeten mit Exit-Code 0, die Summe stimmte (Kapitel 8 zeigt diesen Lauf). Damit sind der `spawnp()`-Zweig mit `fd_map` und `struct inheritance`, die Feature-Test-Makros und das Makefile auf z/OS bestätigt. Das JCL wurde noch nicht vollständig durchlaufen.'),
  P('Unter Linux (WSL, Ubuntu, gcc 13.3) übersetzt das Programm mit `-Wall -Wextra` ohne Warnungen; die Summe stimmte in jedem Lauf, ThreadSanitizer meldete keine Data Races. Auf Nicht-z/OS-Systemen verwendet das Programm ersatzweise `posix_spawnp()` statt `spawnp()`.'),

  /* 2 */
  H1('2 Programmablauf'),
  P('Abbildung 1 zeigt den zeitlichen Ablauf in `main()`. Die linke Spalte ist der Elternprozess, rechts stehen die Kindprozesse.'),
  ...figure(flowPng, 760, 'Abbildung 1: Programmablauf von ussdemo',
    'Flussdiagramm: main prüft --spawn-child, legt Mutexe an, startet Kind A per fork und Kind B per spawn, startet fünf Threads, sammelt ein, prüft die Summe.'),
  STEP('Einstieg. Wird das Programm mit dem Argument `--spawn-child` aufgerufen, ist es das per `spawn()` gestartete Kind. Es schreibt mit `child_work()` die Werte 100 bis 500 auf stdout und endet. Stdout ist in diesem Fall die Pipe zum Elternprozess.'),
  STEP('Mutexe anlegen. `pthread_mutexattr_init()` erzeugt ein Attributobjekt, `pthread_mutex_init()` legt damit zwei Mutexe an: `shared.lock` schützt die gemeinsamen Daten, `log_lock` hält die Ausgabezeilen der Threads zusammen. Das Attributobjekt wird danach mit `pthread_mutexattr_destroy()` freigegeben.'),
  STEP('Kind A per `fork()`. Das Programm legt Pipe A an, leert mit `fflush(NULL)` die Ausgabepuffer und ruft `fork()` auf. Das Kind schließt das Lese-Ende, schreibt die Werte 10 bis 50 in die Pipe und endet mit `_exit()`. Der Elternprozess schließt das Schreib-Ende. Ohne diesen Schritt bekäme der Reader-Thread nie ein EOF.'),
  STEP('Kind B per `spawn()`. Das Programm legt Pipe B an und startet sich mit `spawnp()` selbst, mit dem Argument `--spawn-child`. Über `fd_map` wird das Schreib-Ende der Pipe zum stdout des Kindes. Mit `fd_count = 3` erhält das Kind nur die Deskriptoren 0, 1 und 2. Die `struct inheritance` ist genullt, das Kind erbt also Prozessgruppe, Signalmaske und Signalbehandlung unverändert.'),
  STEP('Threads starten. `pthread_create()` startet zwei Reader-Threads (je eine Pipe) und drei Rechen-Threads (je 20000 Werte). Erst jetzt wird der Prozess multi-threaded.'),
  STEP('Einsammeln. `pthread_join()` wartet auf alle fünf Threads. Danach holt `reap()` mit `waitpid()` den Endestatus beider Kindprozesse ab.'),
  STEP('Prüfen und aufräumen. Das Programm vergleicht die Summe mit dem Sollwert, gibt die Mutex-Statistik aus und gibt beide Mutexe mit `pthread_mutex_destroy()` frei. Der Exit-Code ist 0, wenn die Summe stimmt und beide Kinder fehlerfrei geendet haben.'),
  H2('2.1 Erwartete Summe'),
  P('Die Kinder liefern 10 + 20 + … + 50 = 150 und 100 + 200 + … + 500 = 1500. Jeder Rechen-Thread addiert 1 + 2 + … + 20000 = 200 010 000. Zusammen ergibt das 150 + 1500 + 3 × 200 010 000 = 600 031 650, verteilt auf 60 010 Updates. Der Wert passt in ein 32-Bit-`long`, also auch in den 31-Bit-Modus von z/OS.'),

  /* 3 */
  H1('3 Datenfluss und Koordination über den Mutex'),
  P('Abbildung 2 zeigt die Thread-Phase. Zwischen den Prozessen laufen die Daten über Pipes, denn ein Mutex gilt nur innerhalb eines Prozesses. Innerhalb des Elternprozesses rufen alle fünf Threads dieselbe Funktion `add_result()` auf.'),
  ...figure(dataPng, 500, 'Abbildung 2: Datenfluss und kritischer Abschnitt',
    'Zwei Kindprozesse schreiben über Pipes an zwei Reader-Threads; diese und drei Rechen-Threads rufen add_result auf, das die gemeinsame Summe mit dem Mutex shared.lock schützt.'),
  P('`add_result()` bildet den kritischen Abschnitt. Die Funktion sperrt `shared.lock`, ändert `total`, `updates` und `contended` und gibt den Mutex wieder frei. Ohne den Mutex gingen bei gleichzeitigen Zugriffen Additionen verloren, weil `total += wert` aus Lesen, Rechnen und Schreiben besteht.'),
  P('Der zweite Mutex `log_lock` sorgt nur dafür, dass eine Ausgabezeile nicht von einem anderen Thread unterbrochen wird. Die beiden Mutexe werden nie gleichzeitig gehalten. Ein Deadlock durch unterschiedliche Sperr-Reihenfolgen ist damit ausgeschlossen.'),

  /* 4 */
  H1('4 Aufbau des Programms'),
  H2('4.1 Funktionen'),
  table([2900, 6738], ['Funktion', 'Aufgabe'], [
    ['`check()`', 'Wertet den Rückgabewert von pthread-Funktionen aus und beendet das Programm bei einem Fehler. Kommt mit der z/OS-Konvention (`-1` und `errno`) und mit der POSIX-Konvention (Fehlernummer als Rückgabewert) zurecht.'],
    ['`log_msg()`', 'Formatierte Ausgabe unter `log_lock`.'],
    ['`lock_shared()`', 'Sperrt `shared.lock`. Versucht es zuerst mit `pthread_mutex_trylock()`, wartet bei `EBUSY` regulär und liefert 1 zurück, wenn gewartet wurde. Trägt den Halter ein.'],
    ['`unlock_shared()`', 'Setzt die Halter-Kennung zurück und gibt den Mutex frei.'],
    ['`holds_shared_lock()`', 'Prüft mit `pthread_equal()`, ob der aufrufende Thread den Mutex hält.'],
    ['`update_locked()`', 'Ändert die gemeinsamen Daten. Bricht mit `abort()` ab, wenn der Aufrufer den Mutex nicht hält.'],
    ['`add_result()`', 'Kritischer Abschnitt aus `lock_shared()`, `update_locked()` und `unlock_shared()`.'],
    ['`child_work()`', 'Arbeit der Kindprozesse: fünf Zahlen zeilenweise auf einen Deskriptor schreiben.'],
    ['`reader_thread()`', 'Liest eine Pipe zeilenweise bis EOF und übergibt jeden Wert an `add_result()`.'],
    ['`compute_thread()`', 'Addiert die Werte 1 bis 20000 einzeln über `add_result()`.'],
    ['`start_fork_child()`', 'Legt Pipe A an, erzeugt Kind A mit `fork()`, liefert PID und Lese-Ende.'],
    ['`start_spawn_child()`', 'Legt Pipe B an, erzeugt Kind B mit `spawnp()` (z/OS) oder `posix_spawnp()` (sonst).'],
    ['`reap()`', 'Holt mit `waitpid()` den Endestatus eines Kindes ab und gibt ihn aus.'],
  ]),
  SPACER(),
  H2('4.2 Verwendete Services'),
  table([2900, 6738], ['Service', 'Verwendung'], [
    ['`fork()`', 'Erzeugt Kind A als Kopie des Elternprozesses.'],
    ['`spawnp()`', 'Erzeugt Kind B aus einer Programmdatei. Sucht den Namen über `PATH`, wenn er keinen Schrägstrich enthält. `fd_map` legt fest, welche Deskriptoren das Kind erhält.'],
    ['`pipe()`', 'Je eine Pipe pro Kindprozess als Rückkanal zum Elternprozess.'],
    ['`waitpid()`', 'Abholen des Endestatus, Auswertung mit `WIFEXITED` und `WEXITSTATUS`.'],
    ['`pthread_mutexattr_init()`, `pthread_mutexattr_destroy()`', 'Attributobjekt für die Mutexe, hier mit Standardwerten.'],
    ['`pthread_mutex_init()`, `pthread_mutex_destroy()`', 'Anlegen und Freigeben der beiden Mutexe.'],
    ['`pthread_mutex_lock()`, `pthread_mutex_trylock()`, `pthread_mutex_unlock()`', 'Sperren, nicht blockierender Sperrversuch und Freigeben.'],
    ['`pthread_create()`, `pthread_join()`', 'Starten der fünf Threads und Warten auf ihr Ende.'],
    ['`pthread_self()`, `pthread_equal()`', 'Halter-Buchführung für `shared.lock`.'],
  ]),

  /* 5 */
  H1('5 Besonderheiten unter z/OS'),
  H2('5.1 Prozesse vor Threads'),
  P('`fork()` kopiert in einem Prozess mit mehreren Threads nur den aufrufenden Thread. Hält in diesem Moment ein anderer Thread einen Mutex, bleibt dieser im Kind dauerhaft gesperrt. Das Programm erzeugt deshalb beide Kindprozesse, solange es noch single-threaded ist, und startet die Threads erst danach.'),
  H2('5.2 Fehlerrückgabe der pthread-Funktionen'),
  P('Unter z/OS liefern die pthread-Funktionen bei einem Fehler `-1` und setzen `errno`, außer im UNIX03-Modus. Andere Systeme geben die Fehlernummer direkt zurück. `check()` und `lock_shared()` behandeln beide Konventionen: Ist der Rückgabewert `-1`, gilt `errno`, sonst der Rückgabewert selbst.'),
  H2('5.3 Feature-Test-Makros und pthread_t'),
  P('Für z/OS definiert der Quelltext `_ALL_SOURCE` und `_OPEN_THREADS`, für andere Systeme `_GNU_SOURCE`. Die Unterscheidung läuft über das Compiler-Makro `__MVS__`. Der Typ `pthread_t` ist unter z/OS eine Struktur. Er darf nicht mit `printf` ausgegeben und nur mit `pthread_equal()` verglichen werden.'),
  H2('5.4 spawn() und _BPX_SHAREAS'),
  P('Mit `_BPX_SHAREAS=YES` in der Umgebung läuft das `spawn()`-Kind im Adressraum des Elternprozesses. Es entsteht kein neuer Adressraum, was deutlich schneller ist als `fork()` mit anschließendem `exec()`. Das Makefile-Target `run` und das JCL setzen die Variable.'),
  P('Das Programm startet sich über `argv[0]` selbst. Es muss deshalb als Datei im UNIX-Dateisystem (zFS) liegen. Aus einer Ladebibliothek (PDSE) heraus gäbe es diesen Pfadnamen nicht.'),

  /* 6 */
  H1('6 Mutexe abfragen'),
  P('POSIX kennt keine Funktion wie „ist der Mutex gesperrt?“ oder „wer hält ihn?“. Eine solche Antwort wäre beim Zurückkehren bereits veraltet. Das Programm nutzt deshalb eigene Buchführung, für die Fehlersuche gibt es zusätzlich Werkzeuge von außen.'),
  H2('6.1 Buchführung im Programm'),
  BULLET('Wartefälle zählen: `lock_shared()` ruft zuerst `pthread_mutex_trylock()` auf. Meldet der Aufruf `EBUSY`, hält ein anderer Thread den Mutex. Die Funktion merkt sich das, wartet mit `pthread_mutex_lock()` und liefert 1 zurück. `update_locked()` addiert den Wert auf `shared.contended`.'),
  BULLET('Halter vermerken: Nach dem Sperren trägt `lock_shared()` den Thread in `shared.owner` ein und setzt `shared.held`. `holds_shared_lock()` beantwortet damit die Frage „halte ich den Mutex?“. `update_locked()` nutzt das als Schutz vor Aufrufen ohne Lock.'),
  BULLET('Keine Atomics nötig: Alle Buchführungsfelder liegen selbst unter `shared.lock`.'),
  P('Jeder Thread meldet am Ende seine eigenen Wartefälle, `main()` gibt die Gesamtstatistik aus. Die Zahl hängt stark vom System ab. Unter Linux lag sie zwischen 0 und etwa 2300 von 60 010 Updates: Der kritische Abschnitt ist sehr kurz, und ein Thread, der den Mutex gerade freigegeben hat, bekommt ihn beim nächsten Versuch meist sofort wieder. Auf z/OS lag sie in zwei Läufen bei 64,5 % und 96,8 %; im zweiten Lauf mussten zwei Rechen-Threads bei jedem einzelnen Update warten. Das spricht dafür, dass die z/OS-Implementierung den Mutex bei der Freigabe direkt an einen wartenden Thread übergibt. Der freigebende Thread findet ihn beim nächsten `trylock` dann belegt. Die Statistik misst also nicht nur Gleichzeitigkeit, sondern auch die Vergabestrategie des Systems.'),
  H2('6.2 Werkzeuge von außen'),
  table([2900, 6738], ['Werkzeug', 'Was es zeigt'], [
    ['dbx (z/OS UNIX)', 'Die Subcommands `mutex`, `thread` und `condition` zeigen Mutex-Objekte mit Zustand, Halter und Wartern. Voraussetzung ist eine Übersetzung mit `-g`. Das ist der direkteste Weg für prozessprivate Mutexe.'],
    ['`D OMVS,PID=nnn`', 'Listet die Threads des Prozesses mit ihrem Zustand. Den Mutex selbst zeigt das Kommando nicht.'],
    ['`D OMVS,SER`', 'Zeigt Serialisierungsdaten zu Mutexen und Condition-Variablen in Shared Memory (`PTHREAD_PROCESS_SHARED`). Die Mutexe von `ussdemo` sind prozessprivat und erscheinen dort nicht.'],
    ['gdb (Linux)', '`p shared.lock` zeigt unter `__data.__owner` die Thread-ID des Halters.'],
  ]),
  SPACER(),
  P('Für die Fehlersuche gibt es außerdem den Mutex-Typ `PTHREAD_MUTEX_ERRORCHECK`, gesetzt über `pthread_mutexattr_settype()`. Doppeltes Sperren meldet dann `EDEADLK`, ein Unlock durch einen fremden Thread `EPERM`. Welche Makros z/OS dafür verlangt, steht in der XL C/C++ Runtime Library Reference des jeweiligen Release.'),

  /* 7 */
  H1('7 Übersetzen und Ausführen'),
  H2('7.1 Mit make'),
  P('Das Makefile verwendet keine GNU-Erweiterungen und ist für `/bin/make` von z/OS UNIX ebenso gedacht wie für GNU make. Es kennt die Targets `all`, `run` und `clean`. Compiler und Optionen lassen sich beim Aufruf überschreiben:'),
  table([3400, 6238], ['Umgebung', 'Aufruf'], [
    ['z/OS, xlc (Voreinstellung)', '`make cfg` und `make CFG=-F./cc.cfg`'],
    ['z/OS, xlclang (falls installiert)', '`make CC=xlclang CFLAGS="-q64 -O2"`'],
    ['z/OS, Open XL C/C++', '`make CC=ibm-clang CFLAGS=-O2`'],
    ['Linux (Test)', '`make CC=gcc CFLAGS="-O2 -Wall -pthread"`'],
  ]),
  SPACER(),
  P('Voreingestellt ist `xlc` mit `-O2 -qlanglvl=extc99`; die Option macht unter anderem `snprintf()` sichtbar. `xlclang` aus derselben Compiler-Version erzeugt nur 64-Bit-Code (`-q64`) und setzt voraus, dass seine MVS-Module (`CLCDRVR`) installiert sind, siehe 7.2. Eine eigene Thread-Bibliothek (`-lpthread`) braucht z/OS nicht. Das Makefile enthält bewusst keine Tabulatorzeichen: Das Kommando steht mit `;` in derselben Zeile wie die Regel, zum Beispiel `clean: ; rm -f $(PROG) *.o`.'),
  H2('7.2 Compiler-Bibliothek nicht in LNKLST'),
  P('Der Compiler-Treiber `/usr/lpp/cbclib/xlc/exe/ccndrvr` ist kein Programm, sondern ein externer Link auf das MVS-Modul `CCNDRVR` in `CBC.SCCNCMP`. Findet z/OS dieses Modul nicht in STEPLIB, LNKLST oder LPA, bricht die Übersetzung ab: bei `xlc` mit `FSUM3221 Cannot spawn program …/ccndrvr`, bei `xlclang` (Modul `CLCDRVR`) mit `FSUM3224 … clcdrvr: signal 9 received`. Im SYSLOG steht dann ein Abend `EC6` mit Reason Code `….C032` und `BPXP018I`; die letzten vier Stellen `C032` bedeuten, dass ein Sticky-Programm nicht im MVS-Suchpfad gefunden wurde. Register 5 im Symptom-Dump enthält den Modulnamen in EBCDIC.'),
  P('Die Shell-Variable `STEPLIB` hilft nicht. Der Compiler liest die Bibliothek ausschließlich aus dem Attribut `steplib` seiner Konfigurationsdatei. In der gelieferten `xlc.cfg` steht dort `NONE`:'),
  ...codeBlock('grep -n steplib /usr/lpp/cbclib/xlc/etc/xlc.cfg'),
  SPACER(),
  P('`make cfg` kopiert die Datei deshalb nach `cc.cfg` und trägt `steplib = CBC.SCCNCMP` ein. Übersetzt wird dann mit `make CFG=-F./cc.cfg`; die Option `-F` erwartet den Pfad direkt angehängt, ohne Leerzeichen. Heißt die Bibliothek anders, lautet der Aufruf `make cfg CMPLIB=IHR.NAME`. Welche Bibliotheken es gibt, zeigt `tso "LISTCAT LEVEL(CBC)"`, ob ein Modul enthalten ist `tso "LISTDS \'CBC.SCCNCMP\' MEMBERS" | grep DRVR`. Auf dem Testsystem verwies die gelieferte `xlclang.cfg` auf `CBC.SCLCCMP`, das nicht existiert, und `CLCDRVR` lag in keiner Bibliothek; `xlclang` war dort also nicht nutzbar, `xlc` mit `cc.cfg` schon.'),
  H2('7.3 Übertragung nach z/OS'),
  P('Beim Weg über den ISPF-Editor, über FB80-Datasets oder über manche Dateitransfers werden Tabulatoren in Leerzeichen umgewandelt und Zeilen ab Spalte 73 abgeschnitten. Ein Makefile mit Tab-Rezeptzeilen bricht dann mit `FSUM8232 Expecting macro or rule defn` ab. In C-Quelltext verliert eine abgeschnittene Kommentarzeile ihr schließendes `*/`.'),
  P('Alle drei Dateien sind deshalb tab-frei, und keine Zeile ist länger als 71 Zeichen. Übertragen Sie die Dateien als Text mit der Codepage IBM-1047. Bei einer deutschen Codepage wie IBM-273 oder IBM-1141 kommen eckige und geschweifte Klammern, `#`, `|` und der Backslash falsch an, und der Compiler meldet Syntaxfehler.'),
  H2('7.4 Als Batch-Job'),
  P('`USSDEMO.jcl` enthält zwei BPXBATCH-Steps. `COMPILE` wechselt in das Quellverzeichnis, erzeugt mit `make cfg` die lokale Compiler-Konfiguration, zeigt deren `steplib`-Zeile per `grep` im Job-Output an und ruft dann `make clean all CFG=-F./cc.cfg` auf. `RUN` startet das Programm mit `_BPX_SHAREAS=YES` (im Makefile über `env`, weil z/OS-`make` Kommandos ohne Shell-Metazeichen direkt startet und `VAR=WERT` sonst als Programmname liest) und läuft nur, wenn `COMPILE` mit RC 0 geendet hat. BPXBATCH liefert den Exit-Code der Shell mit 256 multipliziert zurück, ein fehlgeschlagenes `make` erscheint also als RC 256 oder höher. Stdout und stderr beider Steps gehen in den Job-Output.'),
  P('Für den `STDPARM`-Block gelten drei Regeln. Werden sie verletzt, bricht BPXBATCH mit `BPXM010I BPXBATCH FAILED BECAUSE THE PARAMETERS DID NOT START WITH SH OR PGM` ab oder führt ein verstümmeltes Kommando aus.'),
  BULLET('Das erste Wort der ersten Datenzeile ist `SH`, in Großbuchstaben und ab Spalte 1. Davor steht nichts, auch keine Leerzeile und keine `export`-Zeile.'),
  BULLET('Alle Datenzeilen werden zu einem einzigen Kommando zusammengefügt. Folgezeilen beginnen deshalb mit einem Leerzeichen, und Kommandos werden mit `;` oder `&&` getrennt.'),
  BULLET('In den Spalten 73 bis 80 stehen keine Zeilennummern (ISPF: `NUM OFF`, `UNNUM`). Bei `DD *` gehören sie sonst zum Kommando.'),
  P('Vor dem Submit anzupassen:'),
  BULLET('Jobkarte (Account, Klasse, MSGCLASS).'),
  BULLET('Verzeichnis `/u/ibmuser/uss-demo` an zwei Stellen. Dort müssen `ussdemo.c` und `Makefile` liegen, als Text übertragen (siehe 7.3).'),
  BULLET('Compiler-Bibliothek, falls die `steplib`-Zeile der Konfiguration nicht passt (siehe 7.2).'),
  BULLET('Für einen anderen Compiler als `xlc` hängen Sie `CC=…` und `CFLAGS=…` an den `make`-Aufruf an.'),

  /* 8 */
  H1('8 Beispielausgabe'),
  P('Ausgabe eines Laufs auf z/OS 2.4 in der z/OS UNIX Shell mit `_BPX_SHAREAS=YES`. Die Reihenfolge der Thread-Zeilen und die Zahl der Wartefälle ändern sich von Lauf zu Lauf, Summe und Zahl der Updates nicht. Die PIDs zeigen, dass das `fork()`-Kind und das `spawn()`-Kind eigene Prozesse sind, auch wenn das `spawn()`-Kind im Adressraum des Elternprozesses läuft.'),
  ...codeBlock(sample),

  /* Anhaenge */
  PAGEBREAK(),
  H1('Anhang A: ussdemo.c'),
  ...codeFile('ussdemo.c'),
  PAGEBREAK(),
  H1('Anhang B: Makefile'),
  P('Das Makefile enthält keine Tabulatorzeichen. Regel und Kommando stehen in einer Zeile, getrennt durch `;`.'),
  ...codeFile('Makefile'),
  PAGEBREAK(),
  H1('Anhang C: USSDEMO.jcl'),
  ...codeFile('USSDEMO.jcl'),
];

/* ------------------------------------------------------------------ */

const doc = new Document({
  creator: 'ussdemo',
  title: 'USSDEMO – Programmdokumentation',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: 'Calibri', size: 32, bold: true, color: '3C3489' },
        paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: 'Calibri', size: 26, bold: true, color: '444441' },
        paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Code', name: 'Code', basedOn: 'Normal', quickFormat: true,
        run: { font: MONO, size: 17 },
        paragraph: { spacing: { before: 0, after: 0, line: 228 } } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 560, hanging: 280 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 560, hanging: 400 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: ['USSDEMO · Seite ', PageNumber.CURRENT], size: 18, color: '777777' })] })] }),
    },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('geschrieben:', OUT, buf.length, 'Bytes');
});
