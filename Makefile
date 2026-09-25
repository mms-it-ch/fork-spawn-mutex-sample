# Makefile fuer ussdemo
#
# Bewusst ohne GNU-Erweiterungen und OHNE Tabulatorzeichen geschrieben:
# Das Kommando steht mit ";" in derselben Zeile wie die Regel. So
# uebersteht die Datei auch ISPF-Editor, FB80-Datasets und Transfers,
# die Tabs in Leerzeichen umwandeln. Keine Zeile ist laenger als 71.
#
# Voreinstellung: xlc (z/OS XL C/C++) mit lokaler Konfiguration cc.cfg
#
#   z/OS, xlc:       make cfg && make CFG=-F./cc.cfg
#   z/OS, xlclang:   make CC=xlclang CFLAGS="-q64 -O2"
#                    (nur wenn CLCDRVR in einer Bibliothek liegt)
#   z/OS, Open XL:   make CC=ibm-clang CFLAGS=-O2
#   Linux (Test):    make CC=gcc CFLAGS="-O2 -Wall -pthread"
#
# Compiler-Bibliothek (STEPLIB): Der Treiber (ccndrvr bzw. clcdrvr)
# ist nur ein externer Link auf ein MVS-Modul (CCNDRVR bzw. CLCDRVR).
# Wird das Modul nicht in STEPLIB/LNKLST/LPA gefunden, endet der
# Compiler mit FSUM3221 (xlc) oder FSUM3224, Signal 9, Abend EC6
# Reason ....C032 (xlclang). Die Shell-Variable STEPLIB hilft nicht;
# der Wert kommt nur aus dem Attribut "steplib" der Compiler-
# Konfiguration. In der gelieferten xlc.cfg steht dort NONE.
#
# "make cfg" kopiert deshalb $(CCCFG) nach cc.cfg und traegt dort
# steplib = $(CMPLIB) ein. Uebersetzt wird dann mit CFG=-F./cc.cfg
# (-F mit direkt angehaengtem Pfad, ohne Leerzeichen).
#
# Bibliothek pruefen:  tso "LISTCAT LEVEL(CBC)"
#                      tso "LISTDS 'CBC.SCCNCMP' MEMBERS" | grep DRVR
# Anderer Name:        make cfg CMPLIB=IHR.NAME.SCCNCMP
#
# Hinweis z/OS: Threads brauchen keine eigene Bibliothek (-lpthread
# entfaellt); -qlanglvl=extc99 macht u.a. snprintf() sichtbar.

CC      = xlc
CFLAGS  = -O2 -qlanglvl=extc99
LDFLAGS =
CFG     =

CMPLIB  = CBC.SCCNCMP
CCCFG   = /usr/lpp/cbclib/xlc/etc/xlc.cfg

PROG    = ussdemo
SRC     = ussdemo.c

all: $(PROG)

$(PROG): $(SRC) ; $(CC) $(CFG) $(CFLAGS) -o $(PROG) $(SRC) $(LDFLAGS)

# Kopie der Compiler-Konfiguration; in jeder steplib-Zeile wird der
# Wert durch $(CMPLIB) ersetzt.
cfg: ; sed '/steplib/s/=.*/= $(CMPLIB)/' $(CCCFG) > cc.cfg

# _BPX_SHAREAS=YES: spawn()-Kind laeuft im Adressraum des
# Elternprozesses (wird ausserhalb von z/OS ignoriert). "env" ist
# noetig: z/OS make startet Kommandos ohne Shell-Metazeichen direkt
# und hielte VAR=WERT sonst fuer einen Programmnamen (EDC5129I).
run: $(PROG) ; env _BPX_SHAREAS=YES ./$(PROG)

clean: ; rm -f $(PROG) *.o
