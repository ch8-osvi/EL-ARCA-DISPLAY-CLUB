// Load optional local DNS settings BEFORE Next.js/MongoDB create resolvers.
require('dotenv').config({ path: '.env.local', quiet: true });
const dns = require('node:dns');
const { isIP } = require('node:net');
const servers = (process.env.MONGODB_DNS_SERVERS || '').split(',').map(s => s.trim()).filter(Boolean);
if (servers.length && servers.every(s => isIP(s))) {
  dns.setServers(servers);
  dns.promises.setServers(servers);
}
