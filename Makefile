# Makefile fuer ussdemo
#
# Bewusst ohne GNU-Erweiterungen und OHNE Tabulatorzeichen geschrieben:
# Das Kommando steht mit ";" in derselben Zeile wie die Regel. So
# uebersteht die Datei auch ISPF-Editor, FB80-Datasets und Transfers,
# die Tabs in Leerzeichen umwandeln. Keine Zeile ist laenger als 71.
#
# Voreinstellung: xlclang (z/OS XL C/C++ V2.4.1, nur 64 Bit -> -q64)
#
#   z/OS, xlclang:   make
#   z/OS, xlc:       make CC=xlc CFLAGS="-O2 -qlanglvl=extc99"
#   z/OS, Open XL:   make CC=ibm-clang CFLAGS=-O2
#   Linux (Test):    make CC=gcc CFLAGS="-O2 -Wall -pthread"
#
# Compiler-Bibliothek (STEPLIB): Der Treiber (clcdrvr bzw. ccndrvr)
# ist nur ein externer Link auf ein MVS-Modul. Wird das Modul nicht
# gefunden, endet der Compiler mit FSUM3221 (xlc) oder mit FSUM3224,
# Signal 9 und Abend EC6 Reason ....C032 (xlclang). Die Shell-Variable
# STEPLIB hilft nicht; der Wert kommt nur aus dem Attribut "steplib"
# der Compiler-Konfiguration. Erst pruefen, was dort steht:
#
#     grep -n steplib $(CCCFG)
#
# Steht dort bereits eine Bibliothek, die den Treiber enthaelt, ist
# nichts zu tun. Steht dort NONE oder eine falsche Bibliothek, eine
# lokale Kopie cc.cfg mit richtiger Bibliothek erzeugen und nutzen:
#
#     make cfg CMPLIB=CBC.SCLCCMP        (Bibliothek ggf. anpassen)
#     make CFG=-F./cc.cfg
#
# Die Bibliothek muss das Modul CLCDRVR (xlclang) bzw. CCNDRVR (xlc)
# enthalten. Kandidaten zeigt:  tso "LISTCAT LEVEL(CBC)"
# Fuer xlc:  make cfg CCCFG=/usr/lpp/cbclib/xlc/etc/xlc.cfg CMPLIB=...
#
# Hinweis z/OS: Threads brauchen keine eigene Bibliothek (-lpthread
# entfaellt).

CC      = /usr/lpp/cbclib/xlclang/bin/xlclang
CFLAGS  = -q64 -O2
LDFLAGS =
CFG     =

CMPLIB  = CBC.SCLCCMP
CCCFG   = /usr/lpp/cbclib/xlclang/etc/xlclang.cfg

PROG    = ussdemo
SRC     = ussdemo.c

all: $(PROG)

$(PROG): $(SRC) ; $(CC) $(CFG) $(CFLAGS) -o $(PROG) $(SRC) $(LDFLAGS)

# Kopie der Compiler-Konfiguration; in jeder steplib-Zeile wird der
# Wert durch $(CMPLIB) ersetzt.
cfg: ; sed '/steplib/s/=.*/= $(CMPLIB)/' $(CCCFG) > cc.cfg

# _BPX_SHAREAS=YES: spawn()-Kind laeuft im Adressraum des
# Elternprozesses (wird ausserhalb von z/OS ignoriert).
run: $(PROG) ; _BPX_SHAREAS=YES ./$(PROG)

clean: ; rm -f $(PROG) *.o
