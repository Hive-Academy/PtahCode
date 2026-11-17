/** A stop request must not wait indefinitely for a provider handshake. */
export const SESSION_CHILD_STOP_START_WAIT_MS = 5_000;

export async function waitForChildStart(run: Promise<unknown> | undefined): Promise<boolean> {
  if (!run) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run.then(() => true, () => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), SESSION_CHILD_STOP_START_WAIT_MS);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
