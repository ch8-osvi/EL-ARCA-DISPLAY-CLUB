function transientConnectionError(error) {
  // Baileys sometimes rejects init queries with the numeric WebSocket close code.
  if (error === 1006) return true;
  return (
    error instanceof Error &&
    /node_modules[/\\](?:@whiskeysockets[/\\]baileys|ws)[/\\]/.test(
      error.stack || "",
    ) &&
    (error.data === 1006 ||
      [
        "ECONNRESET",
        "ETIMEDOUT",
        "ENETUNREACH",
        "ENOTFOUND",
        "EAI_AGAIN",
      ].includes(error.code))
  );
}
function reconnectScheduler({
  connect,
  stopped,
  onError,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null,
    backoff = 2000;
  return {
    schedule() {
      if (stopped() || timer !== null) return;
      const delay = backoff;
      backoff = Math.min(60000, backoff * 2);
      timer = setTimer(() => {
        timer = null;
        if (!stopped()) void connect().catch(onError);
      }, delay);
      timer?.unref?.();
    },
    reset() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      backoff = 2000;
    },
  };
}
module.exports = { transientConnectionError, reconnectScheduler };
