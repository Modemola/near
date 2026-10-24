/* Test-only shim for running near-sandbox in containers whose hard open-file
 * limit is below the 65535 neard asks for: clamp the request to the hard
 * limit instead of failing. Loaded with LD_PRELOAD by run-sandbox.sh. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/resource.h>
#include <sys/types.h>

static void clamp(int resource, struct rlimit *want) {
    struct rlimit have;
    if (resource == RLIMIT_NOFILE && getrlimit(RLIMIT_NOFILE, &have) == 0) {
        if (want->rlim_max > have.rlim_max) want->rlim_max = have.rlim_max;
        if (want->rlim_cur > want->rlim_max) want->rlim_cur = want->rlim_max;
    }
}

int setrlimit(__rlimit_resource_t resource, const struct rlimit *rlim) {
    static int (*real)(__rlimit_resource_t, const struct rlimit *);
    if (!real) real = dlsym(RTLD_NEXT, "setrlimit");
    struct rlimit r = *rlim;
    clamp(resource, &r);
    return real(resource, &r);
}

int setrlimit64(__rlimit_resource_t resource, const struct rlimit64 *rlim) {
    static int (*real)(__rlimit_resource_t, const struct rlimit64 *);
    if (!real) real = dlsym(RTLD_NEXT, "setrlimit64");
    struct rlimit64 r = *rlim;
    struct rlimit have;
    if (resource == RLIMIT_NOFILE && getrlimit(RLIMIT_NOFILE, &have) == 0) {
        if (r.rlim_max > have.rlim_max) r.rlim_max = have.rlim_max;
        if (r.rlim_cur > r.rlim_max) r.rlim_cur = r.rlim_max;
    }
    return real(resource, &r);
}

int prlimit64(pid_t pid, __rlimit_resource_t resource, const struct rlimit64 *new_limit, struct rlimit64 *old_limit) {
    static int (*real)(pid_t, __rlimit_resource_t, const struct rlimit64 *, struct rlimit64 *);
    if (!real) real = dlsym(RTLD_NEXT, "prlimit64");
    if (!new_limit) return real(pid, resource, new_limit, old_limit);
    struct rlimit64 r = *new_limit;
    struct rlimit have;
    if (resource == RLIMIT_NOFILE && getrlimit(RLIMIT_NOFILE, &have) == 0) {
        if (r.rlim_max > have.rlim_max) r.rlim_max = have.rlim_max;
        if (r.rlim_cur > r.rlim_max) r.rlim_cur = r.rlim_max;
    }
    return real(pid, resource, &r, old_limit);
}
