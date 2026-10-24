// Only known per-message Signal failures may leave the daemon running.
// Never swallow unrelated uncaught failures merely mentioning a session or timeout.
function recoverableSignalError(error) {
  return (
    error instanceof Error &&
    /node_modules[/\\](?:libsignal[/\\]|@whiskeysockets[/\\]baileys[/\\])/.test(
      error.stack || "",
    ) &&
    (/^(?:Bad MAC(?: length)?|Invalid PreKey ID|Missing SignedPreKey|No sessions(?: available)?|No open session|No session record|No matching sessions found for message|Key used already or never filled|Over 2000 messages into the future!|Chain closed|Timed Out)$/.test(
      error.message,
    ) ||
      error.output?.statusCode === 408)
  );
}
module.exports = { recoverableSignalError };
