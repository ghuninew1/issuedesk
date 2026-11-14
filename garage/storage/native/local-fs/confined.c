#define _GNU_SOURCE
#include <node_api.h>
#include <linux/openat2.h>
#include <linux/magic.h>
#include <sys/vfs.h>
#include <sys/syscall.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <stdio.h>

static napi_value fail(napi_env env, int error) {
    const char *code = "LOOKUP_FAILED";
    switch (error) {
        case EINVAL: code = "INVALID_PATH"; break;
        case ELOOP: code = "SYMLINK_DENIED"; break;
        case EXDEV: code = "BOUNDARY_DENIED"; break;
        case ENOENT: code = "NOT_FOUND"; break;
        case EPERM: code = "POLICY_DENIED"; break;
        case ENOSYS: code = "SYSCALL_UNAVAILABLE"; break;
        case EAGAIN: code = "LOOKUP_RACE"; break;
    }
    napi_throw_error(env, code, strerror(error));
    return NULL;
}

static napi_value open_confined(napi_env env, napi_callback_info info) {
    size_t argc = 5, length = 0, copied = 0;
    napi_value args[5], result;
    int32_t root;
    bool directory, exact_device, exact_inode;
    uint64_t device, inode;
    char path[4096];
    if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok ||
        argc != 5 || napi_get_value_int32(env, args[0], &root) != napi_ok ||
        root < 0 ||
        napi_get_value_bigint_uint64(env, args[3], &device, &exact_device) != napi_ok || !exact_device ||
        napi_get_value_bigint_uint64(env, args[4], &inode, &exact_inode) != napi_ok || !exact_inode ||
        napi_get_value_bool(env, args[2], &directory) != napi_ok ||
        napi_get_value_string_utf8(env, args[1], NULL, 0, &length) != napi_ok ||
        length == 0 || length >= sizeof(path) ||
        napi_get_value_string_utf8(env, args[1], path, sizeof(path), &copied) != napi_ok ||
        copied != length || strlen(path) != length || path[0] == '/') {
        return fail(env, EINVAL);
    }
    for (const char *segment = path; segment; ) {
        const char *slash = strchr(segment, '/');
        size_t size = slash ? (size_t)(slash - segment) : strlen(segment);
        if (!size || (size == 2 && !memcmp(segment, "..", 2))) return fail(env, EINVAL);
        segment = slash ? slash + 1 : NULL;
    }
    // Pin the caller's descriptor before validating it or resolving children.
    int pinned_root = fcntl(root, F_DUPFD_CLOEXEC, 0);
    if (pinned_root < 0) return fail(env, errno);
    struct stat root_stat;
    if (fstat(pinned_root, &root_stat) < 0 || !S_ISDIR(root_stat.st_mode) ||
        root_stat.st_nlink == 0 || root_stat.st_dev != device || root_stat.st_ino != inode) {
        close(pinned_root);
        return fail(env, EPERM);
    }

    struct open_how how = {
        .flags = O_PATH | O_CLOEXEC | (directory ? O_DIRECTORY : 0),
        .resolve = RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS | RESOLVE_NO_XDEV,
    };
    int fd = syscall(SYS_openat2, pinned_root, path, &how, sizeof(how));
    int lookup_error = errno;
    close(pinned_root);
    if (fd < 0) return fail(env, lookup_error);
    struct stat st;
    int error = 0;
    if (fstat(fd, &st) < 0) error = errno;
    else if (directory ? !S_ISDIR(st.st_mode) : !S_ISREG(st.st_mode) || st.st_nlink != 1)
        error = EPERM;
    if (error) {
        close(fd);
        return fail(env, error);
    }
    /* Reopen the pinned inode through trusted procfs after checking its type. */
    int proc = open("/proc/self/fd", O_PATH | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    struct statfs filesystem;
    if (proc < 0 || fstatfs(proc, &filesystem) < 0 || filesystem.f_type != PROC_SUPER_MAGIC) {
        if (proc >= 0) close(proc);
        close(fd);
        return fail(env, EPERM);
    }
    char handle[32];
    snprintf(handle, sizeof(handle), "%d", fd);
    int readable = openat(proc, handle, O_RDONLY | O_CLOEXEC | O_NONBLOCK | O_NOCTTY);
    error = errno;
    close(proc);
    if (readable < 0) {
        close(fd);
        return fail(env, error);
    }

    struct stat reopened;
    bool same_inode = fstat(readable, &reopened) == 0 &&
        reopened.st_dev == st.st_dev && reopened.st_ino == st.st_ino &&
        (directory ? S_ISDIR(reopened.st_mode) : S_ISREG(reopened.st_mode) && reopened.st_nlink == 1);
    close(fd);
    if (!same_inode) {
        close(readable);
        return fail(env, EPERM);
    }
    fd = readable;
    if (napi_create_int32(env, fd, &result) != napi_ok) {
        close(fd);
        return fail(env, EIO);
    }
    return result;
}

NAPI_MODULE_INIT() {
    napi_value fn;
    if (napi_create_function(env, "openConfined", NAPI_AUTO_LENGTH, open_confined, NULL, &fn) != napi_ok ||
        napi_set_named_property(env, exports, "openConfined", fn) != napi_ok) return fail(env, EIO);
    return exports;
}
