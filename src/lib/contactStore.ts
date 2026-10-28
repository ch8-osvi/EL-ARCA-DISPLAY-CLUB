/** Deduplicated contact lookup. Network failures never become a permanent empty cache. */
export function createContactStore(
  fetcher: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>,
  now = Date.now,
) {
  let phone = "";
  let validUntil = 0;
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => phone,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh() {
      if (pending) return pending;
      if (now() < validUntil) return Promise.resolve();
      pending = (async () => {
        try {
          const response = await Promise.resolve().then(fetcher);
          if (!response.ok) throw new Error("Contact unavailable");
          const body = await response.json();
          if (
            !body ||
            typeof body !== "object" ||
            !("phone" in body) ||
            typeof body.phone !== "string" ||
            (body.phone !== "" && !/^\d{8,15}$/.test(body.phone))
          )
            throw new Error("Invalid contact");
          validUntil = now() + 30000;
          if (phone !== body.phone) {
            phone = body.phone;
            listeners.forEach((listener) => listener());
          }
        } catch {
          /* Preserve the last verified contact; retry on the next refresh. */
        } finally {
          pending = undefined;
        }
      })();
      return pending;
    },
  };
}
