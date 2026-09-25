# fork-spawn-mutex-sample

Beispielprogramm fuer z/OS UNIX System Services: Prozesserzeugung mit
`fork()` und `spawn()`, Koordination paralleler Threads mit
pthread-Mutexen (`pthread_mutex_init()`).

*Sample for z/OS UNIX System Services: `fork()`, `spawn()` and thread
coordination with pthread mutexes. Documentation is in German.*

## Was das Programm tut

1. Der Elternprozess legt zwei Mutexe an.
2. Kindprozess A entsteht per `fork()`, Kindprozess B per `spawnp()`
   (das Programm startet sich selbst mit `--spawn-child`). Beide
   liefern Zahlen ueber je eine Pipe zurueck.
3. Zwei Reader-Threads lesen die Pipes, drei Rechen-Threads erzeugen
   eigene Werte. Alle fuenf addieren auf dieselbe Summe, geschuetzt
   durch den Mutex `shared.lock`.
4. Das Programm prueft die Summe gegen den Sollwert und gibt aus, wie
   oft ein Thread auf den Mutex warten musste (Buchfuehrung per
   `pthread_mutex_trylock()`, da POSIX keine Mutex-Abfrage kennt).

Auf Nicht-z/OS-Systemen wird ersatzweise `posix_spawnp()` verwendet,
damit sich das Beispiel unter Linux testen laesst.

## Dateien

| Datei | Inhalt |
|---|---|
| `ussdemo.c` | Quelltext |
| `Makefile` | Uebersetzung mit `make`; tab-frei, ohne GNU-Erweiterungen |
| `USSDEMO.jcl` | Batch-Job: Uebersetzen und Ausfuehren per BPXBATCH |
| `USSDEMO-Dokumentation.docx` | Programmdokumentation mit Ablaufdiagrammen |
| `doc/` | Build-Skript fuer die Dokumentation (Node.js) |

Alle Quelldateien sind tab-frei und keine Zeile ist laenger als 71
Zeichen, damit sie ISPF-Editor, FB80-Datasets und Dateitransfers
unbeschadet ueberstehen.

## Uebersetzen

z/OS UNIX mit `xlclang` (Voreinstellung):

    make

Andere Compiler:

    make CC=xlc CFLAGS="-O2 -qlanglvl=extc99"
    make CC=ibm-clang CFLAGS=-O2
    make CC=gcc CFLAGS="-O2 -Wall -pthread"        # Linux

Ausfuehren:

    make run

Meldet der Compiler `FSUM3221` oder `FSUM3224` mit Signal 9 (Abend
`EC6`, Reason `....C032`), fehlt die Compiler-Bibliothek im MVS-
Suchpfad. Die Kommentare im `Makefile` und im JCL beschreiben die
Abhilfe ueber eine lokale Compiler-Konfiguration (`make cfg`).

## Teststand

Unter Linux (WSL, gcc 13) uebersetzt das Programm ohne Warnungen,
die Summe stimmt, ThreadSanitizer meldet keine Data Races. Der
z/OS-spezifische Teil (`spawnp()`, Makefile mit `xlclang`, JCL) ist
noch nicht auf einem z/OS-System durchgelaufen.

## Dokumentation neu erzeugen

    cd doc
    npm install
    npm run build

Erzeugt `USSDEMO-Dokumentation.docx` im Repo-Verzeichnis aus den
aktuellen Quelldateien. Die Diagramme werden mit resvg gerendert;
die Schrift Segoe UI wird vorausgesetzt (Windows).
