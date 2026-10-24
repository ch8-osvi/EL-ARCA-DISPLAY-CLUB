const fs = require("node:fs/promises");
const path = require("node:path");
const { BufferJSON, initAuthCreds, proto } = require("@whiskeysockets/baileys");
// Compatible with existing Baileys session files; writes use atomic replacement.
async function authStore(folder) {
  await fs.mkdir(folder, { recursive: true });
  const locks = new Map();
  const filename = (name) =>
    path.join(folder, name.replace(/\//g, "__").replace(/:/g, "-"));
  const serialized = (name, fn) => {
    const old = locks.get(name) || Promise.resolve();
    const next = old.catch(() => {}).then(fn);
    locks.set(name, next);
    return next.finally(() => {
      if (locks.get(name) === next) locks.delete(name);
    });
  };
  const read = async (name) =>
    serialized(name, async () => {
      try {
        return JSON.parse(
          await fs.readFile(filename(name), "utf8"),
          BufferJSON.reviver,
        );
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    });
  const write = async (name, data) =>
    serialized(name, async () => {
      const target = filename(name);
      if (data == null) {
        await fs.unlink(target).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
        return;
      }
      const temp = target + ".tmp";
      await fs.writeFile(temp, JSON.stringify(data, BufferJSON.replacer), {
        mode: 0o600,
      });
      await fs.rename(temp, target);
    });
  const creds = (await read("creds.json")) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            let value = await read(type + "-" + id + ".json");
            if (type === "app-state-sync-key" && value)
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            result[id] = value;
          }
          return result;
        },
        set: async (data) => {
          for (const type of Object.keys(data))
            for (const id of Object.keys(data[type]))
              await write(type + "-" + id + ".json", data[type][id]);
        },
      },
    },
    saveCreds: () => write("creds.json", creds),
  };
}
module.exports = { authStore };
