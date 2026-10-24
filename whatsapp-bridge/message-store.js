const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { BufferJSON } = require("@whiskeysockets/baileys");

// Persist BEFORE delivery: a recipient may request its retry immediately.
function messageStore(folder, ttl = 7 * 86400000) {
  const filename = (id) =>
    path.join(folder, createHash("sha256").update(id).digest("hex") + ".json");
  return {
    async put(id, message) {
      await fs.mkdir(folder, { recursive: true });
      const file = filename(id),
        temp = file + ".tmp";
      await fs.writeFile(
        temp,
        JSON.stringify(
          { message, expiresAt: Date.now() + ttl },
          BufferJSON.replacer,
        ),
        { mode: 0o600 },
      );
      await fs.rename(temp, file);
    },
    async get(key) {
      if (!key?.id) return undefined;
      try {
        const item = JSON.parse(
          await fs.readFile(filename(key.id), "utf8"),
          BufferJSON.reviver,
        );
        return item.expiresAt > Date.now() ? item.message : undefined;
      } catch (e) {
        if (e.code === "ENOENT") return undefined;
        throw e;
      }
    },
    async prune() {
      await fs.mkdir(folder, { recursive: true });
      for (const name of await fs.readdir(folder)) {
        if (!name.endsWith(".json")) continue;
        const file = path.join(folder, name);
        const item = JSON.parse(await fs.readFile(file, "utf8"));
        if (item.expiresAt <= Date.now()) await fs.unlink(file);
      }
    },
  };
}
module.exports = { messageStore };
