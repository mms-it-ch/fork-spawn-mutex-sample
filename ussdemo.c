/*
 * ussdemo.c - Beispiel fuer z/OS UNIX System Services:
 *             fork(), spawn() und Thread-Koordination mit
 *             pthread-Mutexen
 *
 * Alle Zeilen bleiben unter Spalte 72, damit der Quelltext auch den
 * Weg ueber ISPF-Editor oder FB80-Datasets unbeschadet uebersteht.
 *
 * Ablauf:
 *   1. Der Elternprozess legt zwei Mutexe mit pthread_mutex_init()
 *      an.
 *   2. Kindprozess A wird mit fork() erzeugt, Kindprozess B mit
 *      spawn() (das Programm startet sich selbst mit
 *      "--spawn-child"). Beide Kinder liefern ihre Ergebnisse
 *      zeilenweise ueber eine Pipe.
 *   3. Erst danach werden die Threads gestartet:
 *        - 2 Reader-Threads lesen je eine Pipe (fork-/spawn-Kind)
 *        - 3 Rechen-Threads erzeugen eigene Ergebnisse
 *      Alle Threads schreiben in dieselbe Summe; der Zugriff wird
 *      ueber den Mutex shared.lock serialisiert.
 *   4. Threads einsammeln (pthread_join), Kinder einsammeln
 *      (waitpid), Summe gegen den erwarteten Wert pruefen, Mutexe
 *      freigeben.
 *
 * Mutex-Abfrage: POSIX bietet keine Funktion, um Zustand oder
 * Halter eines Mutex abzufragen. lock_shared() fuehrt deshalb
 * selbst Buch - per pthread_mutex_trylock() wird gezaehlt, wie oft
 * gewartet werden musste, und der aktuelle Halter wird in
 * shared.owner vermerkt.
 *
 * Warum fork()/spawn() VOR pthread_create()?
 *   Ein fork() aus einem Prozess mit mehreren Threads kopiert nur
 *   den aufrufenden Thread. Haelt in diesem Moment ein anderer
 *   Thread einen Mutex, bleibt er im Kind fuer immer gesperrt.
 *   Deshalb: erst die Prozesse, dann die Threads. Ein Mutex gilt
 *   ausserdem nur innerhalb eines Prozesses - zwischen den
 *   Prozessen wird hier ueber Pipes kommuniziert.
 *
 * Uebersetzen unter z/OS UNIX:
 *     make                                (siehe Makefile)
 *     xlclang -q64 -o ussdemo ussdemo.c   (XL C/C++ V2.4.1)
 *     xlc -qlanglvl=extc99 -o ussdemo ussdemo.c
 *     ibm-clang -o ussdemo ussdemo.c      (Open XL C/C++)
 *   Aufruf:  ./ussdemo
 *
 *   Optional:  export _BPX_SHAREAS=YES
 *   Dann laeuft das spawn()-Kind im selben Adressraum wie der
 *   Elternprozess (schneller, kein neuer Adressraum) - ein Vorteil
 *   von spawn() gegenueber fork()+exec(), der z/OS-spezifisch ist.
 *
 * Auf Nicht-z/OS-Systemen (Linux etc.) wird statt spawn()
 * ersatzweise posix_spawnp() verwendet, damit sich das Beispiel
 * auch dort testen laesst.
 */

#ifdef __MVS__
#  define _ALL_SOURCE
#  define _OPEN_THREADS
#else
#  define _GNU_SOURCE
#endif

#include <errno.h>
#include <pthread.h>
#include <spawn.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

#define SPAWN_CHILD_ARG  "--spawn-child"
#define CHILD_ITEMS      5
#define COMPUTE_THREADS  3
/* Genug Arbeit, damit sich die Threads am Mutex wirklich begegnen.
 * Die Summe (ca. 600 Mio.) passt noch in ein 32-Bit-long
 * (z/OS 31-Bit-Modus). */
#define COMPUTE_ITEMS    20000

/* -------------------------------------------------------------- */
/* Gemeinsame Daten aller Threads                                  */
/* -------------------------------------------------------------- */

struct shared {
    pthread_mutex_t lock;       /* schuetzt alle folgenden Felder */
    long            total;
    long            updates;
    long            contended;  /* Updates mit Wartezeit am Mutex */
    int             held;       /* Mutex gerade gehalten?         */
    pthread_t       owner;      /* ... von wem (nur bei held)     */
};

static struct shared   shared;
static pthread_mutex_t log_lock;   /* haelt Ausgabezeilen zusammen */

struct reader_arg {
    const char *name;
    int         fd;
};

/*
 * z/OS liefert bei pthread-Fehlern -1 und setzt errno (ausser im
 * UNIX03-Modus), andere Systeme liefern die Fehlernummer direkt
 * zurueck. check() kommt mit beiden Varianten zurecht.
 */
static void check(int rc, const char *what)
{
    if (rc != 0) {
        int err = (rc == -1) ? errno : rc;
        fprintf(stderr, "%s fehlgeschlagen: %s\n",
                what, strerror(err));
        exit(EXIT_FAILURE);
    }
}

static void log_msg(const char *fmt, ...)
{
    va_list ap;

    check(pthread_mutex_lock(&log_lock), "mutex_lock(log)");
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    fflush(stdout);
    check(pthread_mutex_unlock(&log_lock), "mutex_unlock(log)");
}

/*
 * POSIX kennt keine Abfrage "ist der Mutex gesperrt / wer haelt
 * ihn?". Deshalb eigene Buchfuehrung: lock_shared() versucht es
 * zuerst mit pthread_mutex_trylock(). Meldet das EBUSY, haelt
 * gerade ein anderer Thread den Mutex - wir merken uns das und
 * warten dann regulaer. Die Buchfuehrungsfelder liegen selbst
 * unter dem Mutex, brauchen also keine atomaren Operationen.
 *
 * Rueckgabe: 1, wenn auf den Mutex gewartet werden musste, sonst 0.
 */
static int lock_shared(void)
{
    int waited = 0;
    int rc = pthread_mutex_trylock(&shared.lock);

    if (rc != 0) {
        int err = (rc == -1) ? errno : rc;
        if (err != EBUSY)
            check(rc, "pthread_mutex_trylock");
        waited = 1;
        check(pthread_mutex_lock(&shared.lock), "mutex_lock");
    }
    shared.owner = pthread_self();
    shared.held  = 1;
    return waited;
}

static void unlock_shared(void)
{
    shared.held = 0;
    check(pthread_mutex_unlock(&shared.lock), "mutex_unlock");
}

/*
 * Haelt der aufrufende Thread den Mutex? pthread_t ist unter z/OS
 * eine Struktur - Vergleich deshalb nur mit pthread_equal(), nie
 * mit ==.
 */
static int holds_shared_lock(void)
{
    return shared.held
        && pthread_equal(shared.owner, pthread_self());
}

/* Darf nur mit gehaltenem Mutex aufgerufen werden - wird geprueft. */
static void update_locked(long value, int waited)
{
    if (!holds_shared_lock()) {
        fprintf(stderr, "interner Fehler: update ohne Mutex\n");
        abort();
    }
    shared.total     += value;
    shared.updates++;
    shared.contended += waited;
}

/*
 * Kritischer Abschnitt: nur ein Thread gleichzeitig aendert die
 * Summe. Rueckgabe: 1, wenn dieser Aufruf auf den Mutex warten
 * musste.
 */
static int add_result(long value)
{
    int waited = lock_shared();

    update_locked(value, waited);
    unlock_shared();
    return waited;
}

/* -------------------------------------------------------------- */
/* Arbeit der Kindprozesse: CHILD_ITEMS Zahlen auf out_fd          */
/* -------------------------------------------------------------- */

static void child_work(int out_fd, long factor)
{
    char buf[32];
    int  i, len;

    for (i = 1; i <= CHILD_ITEMS; i++) {
        len = snprintf(buf, sizeof buf, "%ld\n", i * factor);
        if (write(out_fd, buf, (size_t)len) != len)
            _exit(EXIT_FAILURE);
    }
}

/* -------------------------------------------------------------- */
/* Threads                                                         */
/* -------------------------------------------------------------- */

/* Liest die Ergebnisse eines Kindprozesses bis EOF aus der Pipe. */
static void *reader_thread(void *arg)
{
    struct reader_arg *ra = arg;
    char  line[64];
    int   waits = 0;
    FILE *in = fdopen(ra->fd, "r");

    if (in == NULL) {
        perror("fdopen");
        return NULL;
    }
    while (fgets(line, sizeof line, in) != NULL) {
        long value = strtol(line, NULL, 10);
        waits += add_result(value);
        log_msg("[reader %-5s] Wert %ld vom Kind uebernommen\n",
                ra->name, value);
    }
    fclose(in);
    log_msg("[reader %-5s] Pipe zu, %d mal auf Mutex gewartet\n",
            ra->name, waits);
    return NULL;
}

static void *compute_thread(void *arg)
{
    int  id = *(int *)arg;
    int  waits = 0;
    long i;

    for (i = 1; i <= COMPUTE_ITEMS; i++)
        waits += add_result(i);
    log_msg("[compute %d   ] %d Werte, %d mal auf Mutex gewartet\n",
            id, COMPUTE_ITEMS, waits);
    return NULL;
}

/* -------------------------------------------------------------- */
/* Prozesserzeugung                                                */
/* -------------------------------------------------------------- */

/* Kind A per fork(); liefert das Lese-Ende der Pipe zurueck. */
static pid_t start_fork_child(int *read_fd)
{
    int   p[2];
    pid_t pid;

    if (pipe(p) == -1) {
        perror("pipe");
        exit(EXIT_FAILURE);
    }
    fflush(NULL);           /* sonst landen Puffer doppelt im Kind */
    pid = fork();
    if (pid == -1) {
        perror("fork");
        exit(EXIT_FAILURE);
    }
    if (pid == 0) {         /* Kindprozess */
        close(p[0]);
        child_work(p[1], 10);
        close(p[1]);
        _exit(EXIT_SUCCESS);
    }
    close(p[1]);            /* Eltern: Schreib-Ende zu -> EOF */
    *read_fd = p[0];
    return pid;
}

/* Kind B per spawn(); stdout des Kindes wird auf die Pipe gelegt. */
static pid_t start_spawn_child(const char *self, int *read_fd)
{
    int         p[2];
    pid_t       pid;
    const char *child_argv[3];

    if (pipe(p) == -1) {
        perror("pipe");
        exit(EXIT_FAILURE);
    }
    child_argv[0] = self;
    child_argv[1] = SPAWN_CHILD_ARG;
    child_argv[2] = NULL;

#ifdef __MVS__
    {
        struct inheritance inh;
        int fd_map[3];

        memset(&inh, 0, sizeof inh);    /* flags = 0: alles erben */

        /* fd_map[i] = Deskriptor des Elternprozesses, der im Kind
         * fd i wird. Mit fd_count = 3 erhaelt das Kind NUR diese
         * drei Deskriptoren. */
        fd_map[0] = STDIN_FILENO;
        fd_map[1] = p[1];               /* stdout Kind -> Pipe */
        fd_map[2] = STDERR_FILENO;

        pid = spawnp(self, 3, fd_map, &inh, child_argv,
                     (const char **)environ);
        if (pid == -1) {
            perror("spawnp");
            exit(EXIT_FAILURE);
        }
    }
#else
    {
        posix_spawn_file_actions_t fa;
        int rc;

        posix_spawn_file_actions_init(&fa);
        posix_spawn_file_actions_adddup2(&fa, p[1], STDOUT_FILENO);
        posix_spawn_file_actions_addclose(&fa, p[0]);
        posix_spawn_file_actions_addclose(&fa, p[1]);
        rc = posix_spawnp(&pid, self, &fa, NULL,
                          (char *const *)child_argv, environ);
        posix_spawn_file_actions_destroy(&fa);
        if (rc != 0) {
            fprintf(stderr, "posix_spawnp: %s\n", strerror(rc));
            exit(EXIT_FAILURE);
        }
    }
#endif

    close(p[1]);
    *read_fd = p[0];
    return pid;
}

static int reap(pid_t pid, const char *name)
{
    int status;

    if (waitpid(pid, &status, 0) == -1) {
        perror("waitpid");
        return -1;
    }
    if (WIFEXITED(status)) {
        printf("Kindprozess %-5s (pid %ld) beendet, exit=%d\n",
               name, (long)pid, WEXITSTATUS(status));
        return WEXITSTATUS(status);
    }
    printf("Kindprozess %-5s (pid %ld) abnormal beendet\n",
           name, (long)pid);
    return -1;
}

/* -------------------------------------------------------------- */

int main(int argc, char *argv[])
{
    pthread_mutexattr_t attr;
    pthread_t           readers[2];
    pthread_t           workers[COMPUTE_THREADS];
    struct reader_arg   rargs[2];
    int                 ids[COMPUTE_THREADS];
    pid_t               fork_pid, spawn_pid;
    long                expected;
    int                 i, failed = 0;

    /* Zweig fuer das per spawn() gestartete Kind: stdout = Pipe. */
    if (argc > 1 && strcmp(argv[1], SPAWN_CHILD_ARG) == 0) {
        child_work(STDOUT_FILENO, 100);
        return EXIT_SUCCESS;
    }

    /* 1. Mutexe anlegen */
    check(pthread_mutexattr_init(&attr), "mutexattr_init");
    check(pthread_mutex_init(&shared.lock, &attr), "mutex_init");
    check(pthread_mutex_init(&log_lock, &attr), "mutex_init(log)");
    check(pthread_mutexattr_destroy(&attr), "mutexattr_destroy");

    /* 2. Kindprozesse starten (noch single-threaded!) */
    rargs[0].name = "fork";
    rargs[1].name = "spawn";
    fork_pid  = start_fork_child(&rargs[0].fd);
    rargs[1].fd = -1;
    spawn_pid = start_spawn_child(argv[0], &rargs[1].fd);
    printf("Elternprozess pid %ld: fork-Kind %ld, spawn-Kind %ld\n",
           (long)getpid(), (long)fork_pid, (long)spawn_pid);

    /* 3. Threads starten */
    for (i = 0; i < 2; i++)
        check(pthread_create(&readers[i], NULL,
                             reader_thread, &rargs[i]),
              "pthread_create(reader)");
    for (i = 0; i < COMPUTE_THREADS; i++) {
        ids[i] = i + 1;
        check(pthread_create(&workers[i], NULL,
                             compute_thread, &ids[i]),
              "pthread_create(compute)");
    }

    /* 4. Einsammeln */
    for (i = 0; i < 2; i++)
        check(pthread_join(readers[i], NULL), "join(reader)");
    for (i = 0; i < COMPUTE_THREADS; i++)
        check(pthread_join(workers[i], NULL), "join(compute)");

    failed |= reap(fork_pid, "fork") != 0;
    failed |= reap(spawn_pid, "spawn") != 0;

    /* Summe 1..n = n(n+1)/2 */
    expected = (long)CHILD_ITEMS * (CHILD_ITEMS + 1) / 2 * (10 + 100)
             + (long)COMPUTE_THREADS
               * COMPUTE_ITEMS * (COMPUTE_ITEMS + 1) / 2;

    printf("Summe = %ld (erwartet %ld), %ld Updates -> %s\n",
           shared.total, expected, shared.updates,
           shared.total == expected ? "OK" : "FEHLER");
    failed |= shared.total != expected;

    /* Alle Threads sind beendet - Lesen ohne Mutex unkritisch. */
    printf("Mutex-Statistik: %ld von %ld Updates warteten (%.1f %%)\n",
           shared.contended, shared.updates,
           shared.updates
               ? 100.0 * shared.contended / shared.updates : 0.0);

    check(pthread_mutex_destroy(&shared.lock), "mutex_destroy");
    check(pthread_mutex_destroy(&log_lock), "mutex_destroy(log)");

    return failed ? EXIT_FAILURE : EXIT_SUCCESS;
}
