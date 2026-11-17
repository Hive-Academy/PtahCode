#define WIN32_LEAN_AND_MEAN
#define NAPI_VERSION 8
#include <windows.h>
#include <node_api.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct {
  HANDLE job;
} job_handle;

/* Marks the externals of this module, so closeJob rejects a foreign external. */
static const napi_type_tag job_type_tag = {0x9f1c2a7b4d3e4f60ULL,
                                           0xa1b2c3d4e5f60718ULL};

static napi_value win32_error(napi_env env, const char* function, DWORD code) {
  char message[128];
  snprintf(message, sizeof(message), "%s failed (GetLastError %lu)", function,
           (unsigned long)code);
  napi_throw_error(env, NULL, message);
  return NULL;
}

static napi_value api_error(napi_env env, const char* function) {
  napi_throw_error(env, NULL, function);
  return NULL;
}

/* A handle that the caller dropped without closeJob closes here. The job then
 * kills its processes. This is the safe direction: no tree outlives its owner. */
static void finalize_job(napi_env env, void* data, void* hint) {
  job_handle* handle = (job_handle*)data;
  (void)env;
  (void)hint;
  if (handle != NULL) {
    if (handle->job != NULL) CloseHandle(handle->job);
    free(handle);
  }
}

static napi_value create_job_for_pid(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_valuetype type;
  double numeric_pid;
  DWORD pid;
  HANDLE job;
  HANDLE process_handle;
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {0};
  job_handle* handle;
  napi_value result;
  DWORD error;

  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok ||
      argc != 1 || napi_typeof(env, args[0], &type) != napi_ok ||
      type != napi_number ||
      napi_get_value_double(env, args[0], &numeric_pid) != napi_ok ||
      numeric_pid != numeric_pid || numeric_pid < 1 || numeric_pid > UINT32_MAX ||
      (double)(uint32_t)numeric_pid != numeric_pid) {
    return api_error(env, "createJobForPid requires a positive 32-bit integer PID");
  }
  pid = (DWORD)numeric_pid;
  /* The caller must hold a live handle of the process (for example a Node
   * ChildProcess that did not emit exit), so the PID cannot be reused here.
   * AssignProcessToJobObject needs PROCESS_SET_QUOTA and PROCESS_TERMINATE. */
  /* NULL security attributes give a non-inheritable, unnamed job handle. */
  job = CreateJobObjectW(NULL, NULL);
  if (job == NULL) return win32_error(env, "CreateJobObjectW", GetLastError());
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation,
                               &limits, sizeof(limits))) {
    error = GetLastError();
    CloseHandle(job);
    return win32_error(env, "SetInformationJobObject", error);
  }
  process_handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, FALSE, pid);
  if (process_handle == NULL) {
    error = GetLastError();
    CloseHandle(job);
    return win32_error(env, "OpenProcess", error);
  }
  if (!AssignProcessToJobObject(job, process_handle)) {
    error = GetLastError();
    CloseHandle(process_handle);
    CloseHandle(job);
    return win32_error(env, "AssignProcessToJobObject", error);
  }
  if (!CloseHandle(process_handle)) {
    error = GetLastError();
    CloseHandle(job);
    return win32_error(env, "CloseHandle(process)", error);
  }
  handle = (job_handle*)malloc(sizeof(*handle));
  if (handle == NULL) {
    CloseHandle(job);
    return api_error(env, "malloc failed for job handle");
  }
  handle->job = job;
  if (napi_create_external(env, handle, finalize_job, NULL, &result) != napi_ok) {
    finalize_job(env, handle, NULL);
    return api_error(env, "napi_create_external failed");
  }
  if (napi_type_tag_object(env, result, &job_type_tag) != napi_ok) {
    /* The finalizer of the external owns the handle and closes it. */
    return api_error(env, "napi_type_tag_object failed");
  }
  return result;
}

static napi_value close_job(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  job_handle* handle;
  HANDLE job;
  bool is_job = false;
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok ||
      argc != 1 ||
      napi_check_object_type_tag(env, args[0], &job_type_tag, &is_job) != napi_ok ||
      !is_job ||
      napi_get_value_external(env, args[0], (void**)&handle) != napi_ok ||
      handle == NULL) {
    return api_error(env, "closeJob requires a job handle");
  }
  job = handle->job;
  if (job != NULL) {
    handle->job = NULL;
    if (!CloseHandle(job)) return win32_error(env, "CloseHandle(job)", GetLastError());
  }
  napi_value result;
  if (napi_get_undefined(env, &result) != napi_ok)
    return api_error(env, "napi_get_undefined failed");
  return result;
}

static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"createJobForPid", NULL, create_job_for_pid, NULL, NULL, NULL,
       napi_default, NULL},
      {"closeJob", NULL, close_job, NULL, NULL, NULL, napi_default, NULL}};
  if (napi_define_properties(env, exports, 2, properties) != napi_ok) {
    napi_throw_error(env, NULL, "napi_define_properties failed");
    return NULL;
  }
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
