//USSDEMO  JOB (ACCT),'USSDEMO COMPILE',CLASS=A,MSGCLASS=H,
//             MSGLEVEL=(1,1),NOTIFY=&SYSUID,REGION=0M
//*-------------------------------------------------------------------*
//* USSDEMO UEBERSETZEN UND AUSFUEHREN                                *
//*                                                                   *
//* DAS PROGRAMM STARTET SICH PER SPAWN() SELBST UEBER SEINEN         *
//* PFADNAMEN. ES MUSS DESHALB IM UNIX-DATEISYSTEM (ZFS) LIEGEN UND   *
//* WIRD DORT MIT BPXBATCH UEBERSETZT - NICHT MIT EDCCB IN EINE       *
//* LADEBIBLIOTHEK.                                                   *
//*                                                                   *
//* VOR DEM SUBMIT ANPASSEN:                                          *
//*   - JOBKARTE                                                      *
//*   - VERZEICHNIS /u/ibmuser/uss-demo (2 STELLEN); DORT MUESSEN     *
//*     USSDEMO.C UND MAKEFILE LIEGEN                                 *
//*   - COMPILER IST xlc MIT LOKALER KONFIGURATION cc.cfg (SIEHE      *
//*     MAKEFILE UND UNTEN)                                           *
//*                                                                   *
//* REGELN FUER DEN STDPARM-BLOCK (SONST MELDUNG BPXM010I):           *
//*   - DAS ERSTE WORT DER ERSTEN DATENZEILE MUSS SH SEIN, IN         *
//*     GROSSBUCHSTABEN UND AB SPALTE 1. KEINE ZEILE DAVOR, AUCH      *
//*     KEINE LEERZEILE UND KEIN KOMMENTAR.                           *
//*   - ALLE DATENZEILEN WERDEN ZU EINEM EINZIGEN KOMMANDO            *
//*     ZUSAMMENGEFUEGT. FOLGEZEILEN DESHALB MIT EINEM LEERZEICHEN    *
//*     BEGINNEN UND KOMMANDOS MIT ; ODER && TRENNEN.                 *
//*   - KEINE ZEILENNUMMERN IN SPALTE 73-80 (ISPF: NUM OFF, UNNUM).   *
//*     BEI DD * GEHOEREN SIE SONST ZUM KOMMANDO.                     *
//*                                                                   *
//* COMPILER-BIBLIOTHEK: DER TREIBER ccndrvr IST EIN EXTERNER LINK    *
//* AUF DAS MVS-MODUL CCNDRVR IN CBC.SCCNCMP. WIRD ES NICHT IN        *
//* STEPLIB/LNKLST/LPA GEFUNDEN: FSUM3221 (xlc) BZW. FSUM3224,        *
//* SIGNAL 9, ABEND EC6 REASON ....C032 (xlclang). DIE SHELL-         *
//* VARIABLE STEPLIB HILFT NICHT, DER WERT KOMMT NUR AUS DEM          *
//* ATTRIBUT steplib DER COMPILER-KONFIGURATION, UND DORT STEHT       *
//* IN DER GELIEFERTEN xlc.cfg NONE. DER STEP COMPILE ERZEUGT         *
//* DESHALB MIT "make cfg" EINE KOPIE cc.cfg MIT steplib =            *
//* CBC.SCCNCMP, ZEIGT DIE ZEILE IM JOB-OUTPUT (grep) UND             *
//* UEBERSETZT MIT CFG=-F./cc.cfg.                                    *
//*   - HEISST DIE BIBLIOTHEK ANDERS: make cfg CMPLIB=IHR.NAME        *
//*     (KANDIDATEN: tso "LISTCAT LEVEL(CBC)")                        *
//*   - STEHT CBC.SCCNCMP IN LNKLST/LPA, GENUEGT: make clean all      *
//*                                                                   *
//* SH STARTET EINE LOGIN-SHELL: /etc/profile UND $HOME/.profile      *
//* WERDEN AUSGEFUEHRT. STDOUT/STDERR GEHEN IN DEN JOB-OUTPUT.        *
//*-------------------------------------------------------------------*
//*
//COMPILE  EXEC PGM=BPXBATCH
//STDPARM  DD *
SH cd /u/ibmuser/uss-demo &&
 make cfg && grep -n steplib cc.cfg &&
 make clean all CFG=-F./cc.cfg
/*
//STDOUT   DD SYSOUT=*
//STDERR   DD SYSOUT=*
//*
//* NUR AUSFUEHREN, WENN DIE UEBERSETZUNG FEHLERFREI WAR
//*
//CHECK    IF (COMPILE.RC = 0) THEN
//RUN      EXEC PGM=BPXBATCH
//STDPARM  DD *
SH cd /u/ibmuser/uss-demo && _BPX_SHAREAS=YES ./ussdemo
/*
//STDOUT   DD SYSOUT=*
//STDERR   DD SYSOUT=*
//         ENDIF
