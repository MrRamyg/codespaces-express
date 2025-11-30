// helpers/pterodactyl.js
const axios = require('axios');
const crypto = require('crypto');
const { sendMail } = require('./mail');
const { sendWebhook } = require('./discord');

const API_KEY = process.env.PELICAN_API_KEY || 'papp_e9VeGT4CpDh14Iokqy3HbgltpJichvA6bBgxYA5fDEV';
const PANEL_BASE = process.env.PELICAN_BASE || 'https://panel.nexfinityhosting.com/api/application';

// TESTING fallback IDs (you can remove these and rely on args/env in production)
const DEFAULT_NODE_ID = process.env.PELICAN_NODE_ID ? Number(process.env.PELICAN_NODE_ID) : 1;
const DEFAULT_ALLOCATION_ID = process.env.PELICAN_ALLOCATION_ID ? String(process.env.PELICAN_ALLOCATION_ID) : '1';

function safeStringify(obj) {
  try { return JSON.stringify(obj, null, 2); } catch (e) { return String(e); }
}

function buildCurl(url, headers, payload) {
  const payloadText = safeStringify(payload).replace(/\n/g, ' ').replace(/'/g, `'\\''`);
  return `curl -v -X POST '${url}' \\\n  -H "Accept: application/json" \\\n  -H "Authorization: Bearer ${API_KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '${payloadText}'`;
}

function envArrayToObject(envArray = []) {
  const obj = {};
  for (const item of envArray) {
    if (typeof item !== 'string') continue;
    const idx = item.indexOf('=');
    if (idx === -1) continue;
    const key = item.slice(0, idx).trim();
    const val = item.slice(idx + 1).trim();
    if (key) obj[key] = val;
  }
  return obj;
}

function randomPassword(len = 16) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

/* ----- panel helpers: find or create user by email ----- */
async function findUserIdByEmail(email) {
  if (!email) return null;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${API_KEY}` };

  // Basic pagination loop — stops when no more pages or match found
  let page = 1;
  while (true) {
    try {
      const resp = await axios.get(`${PANEL_BASE}/users?page=${page}`, { headers, timeout: 10000 });
      const list = Array.isArray(resp.data?.data) ? resp.data.data : Array.isArray(resp.data) ? resp.data : [];
      if (!list.length) break;
      for (const u of list) {
        // shape might be { attributes: { email, id }} or { email, id } depending on panel
        const emailVal = u?.attributes?.email || u?.email;
        const idVal = u?.attributes?.id || u?.id;
        if (!emailVal) continue;
        if (emailVal.toLowerCase() === email.toLowerCase()) return Number(idVal);
      }
      // attempt to detect if there's a next page: some panels include meta/pagination
      // fallback: increment page and try again until empty
      page += 1;
      // safety guard
      if (page > 20) break;
    } catch (err) {
      console.warn('findUserIdByEmail failed while listing users:', err?.message || err);
      break;
    }
  }
  return null;
}

async function createPanelUser({ email, username, name }) {
  // Best-effort create user. Panels differ — use minimal payload and handle failure.
  const headers = { Accept: 'application/json', Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  const password = randomPassword(12);
  const payload = {
    email,
    username: username || (email ? email.split('@')[0] : `user_${Date.now()}`),
    first_name: name ? name.split(' ')[0] : '',
    last_name: name ? name.split(' ').slice(1).join(' ') : '',
    password
  };

  try {
    const resp = await axios.post(`${PANEL_BASE}/users`, payload, { headers, timeout: 10000 });
    // resp.data might contain attributes.id or id
    const id = resp?.data?.attributes?.id || resp?.data?.id;
    return Number(id);
  } catch (err) {
    console.warn('createPanelUser failed (panel may not allow creating users via app key):', err?.message || err);
    throw err;
  }
}

/* ----- main deploy function ----- */
/**
 * deployInstance
 * @param {Object} options - deployment options
 *   options.userEmail (string) - required: email to resolve panel user
 *   options.eggId (number) - required: egg id (programming language)
 *   options.nodeId (number) - required: node id
 *   options.name (string) - optional server name
 *   options.startup (string) - optional startup command
 *   options.image (string) - optional docker image
 *   options.envArray (Array) - optional env as ["K=V"]
 *   options.envObject (Object) - optional env as { K: "V" } (takes precedence)
 *   options.limits (Object) - optional limits
 *   options.feature_limits (Object) - optional feature_limits
 *   options.allocationId (string|number) - optional allocation id
 *   options.notifyEmail (string) - optional email to notify (if not, notify userEmail)
 *   options.discordWebhook (string) - optional webhook url to notify
 */
async function deployInstance(options = {}) {
  if (!options || typeof options !== 'object') throw new Error('deployInstance: options object required');

  const {
    userEmail,
    eggId,
    nodeId,
    name,
    startup,
    image,
    envArray,
    envObject,
    limits,
    feature_limits,
    allocationId,
    notifyEmail,
    discordWebhook,
    gitConfig // optional, supports gitConfig.envArray too
  } = options;

  if (!userEmail) throw new Error('userEmail is required');
  if (!eggId) throw new Error('eggId (programming language) is required');
  if (!nodeId) throw new Error('nodeId is required');

  // Resolve user id by email
  let userId = await findUserIdByEmail(userEmail);
  if (!userId) {
    // Try to create the user as a last resort (best-effort)
    try {
      userId = await createPanelUser({ email: userEmail, username: userEmail.split('@')[0], name: '' });
    } catch (err) {
      // If creation fails, return a clear error so caller can handle (or we can fallback to a default user)
      const ex = new Error('Panel user not found and could not be created. Provide an existing panel email or create the user manually.');
      ex.pelicanResponse = { message: err?.message || 'create user failed', cause: err?.response?.data || null };
      throw ex;
    }
  }

  // Resolve allocationId (prefer provided, else fall back to DEFAULT_ALLOCATION_ID)
  const resolvedAllocation = allocationId ? String(allocationId) : DEFAULT_ALLOCATION_ID;

  // Build environment object (object wins over array)
  let env = {};
  if (envObject && typeof envObject === 'object' && Object.keys(envObject).length) {
    env = { ...envObject };
  } else if (Array.isArray(envArray) && envArray.length) {
    env = { ...env, ...envArrayToObject(envArray) };
  } else if (gitConfig && Array.isArray(gitConfig.envArray) && gitConfig.envArray.length) {
    env = { ...env, ...envArrayToObject(gitConfig.envArray) };
  }

  // Ensure minimal defaults
  if (!env.TOKEN) env.TOKEN = 'REPLACE_ME';
  if (!env.RCON_PASS) env.RCON_PASS = randomPassword(12); // many eggs require RCON_PASS

  const payload = {
    external_id: null,
    name: name || (gitConfig && gitConfig.name) || `Bot-${Date.now()}`,
    description: (gitConfig && gitConfig.description) || 'Discord bot automatic deployment',
    user: Number(userId),
    egg: Number(eggId),
    docker_image: image || (gitConfig && gitConfig.docker_image) || 'discord-bot:latest',
    startup: startup || (gitConfig && gitConfig.startup) || 'node index.js',
    environment: env, // IMPORTANT: object shape expected by panel
    skip_scripts: true,
    oom_killer: true,
    start_on_completion: true,
    limits: Object.assign({
      memory: 512,
      swap: 0,
      disk: 1024,
      io: 500,
      threads: null,
      cpu: 1
    }, limits || {}),
    feature_limits: Object.assign({
      databases: 0,
      allocations: 0,
      backups: 0
    }, feature_limits || {}),
    allocation: { default: Number(resolvedAllocation), additional: [] },
    deploy: {
      locations: [],
      tags: [],
      dedicated_ip: false,
      port_range: []
    }
  };

  const url = `${PANEL_BASE}/servers`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`
  };
  const curlExample = buildCurl(url, headers, payload);
  console.log('Posting to Pelican:', url);
  console.log('Payload:', safeStringify(payload));
  console.log('CURL (replicate this exactly):\n', curlExample);

  try {
    const resp = await axios.post(url, payload, { headers, timeout: 30000 });
    const serverData = resp.data;

    // Notify user via email and discord if configured
    const notifyToEmail = notifyEmail || userEmail || process.env.ADMIN_EMAIL;
    const webhookUrl = discordWebhook || process.env.DEPLOY_DISCORD_WEBHOOK;

    // Compose notification info
    const serverAttrs = serverData?.attributes || serverData;
    const serverName = serverAttrs?.name || payload.name;
    const serverId = serverAttrs?.id || serverAttrs?.identifier || 'N/A';
    const serverUuid = serverAttrs?.uuid || serverAttrs?.identifier || 'N/A';
    const createdAt = serverAttrs?.created_at || new Date().toISOString();

    // send email (best-effort)
    if (notifyToEmail) {
      try {
        await sendMail({
          to: notifyToEmail,
          subject: `Your server "${serverName}" is provisioning`,
          text: `Server ${serverName} (${serverId}) has been created and is provisioning. UUID: ${serverUuid}\n\nIf this was not requested, contact support.`,
          html: `<p>Server <strong>${serverName}</strong> (${serverId}) has been created and is provisioning.</p><p>UUID: <code>${serverUuid}</code></p>`
        });
      } catch (err) {
        console.warn('Failed to send deploy email:', err?.message || err);
      }
    }

    // send discord webhook (best-effort)
    if (webhookUrl) {
      try {
        const content = `Server **${serverName}** (${serverId}) created — provisioning.`;
        await sendWebhook(webhookUrl, content, { embeds: [{ title: serverName, description: `ID: ${serverId}\nUUID: ${serverUuid}`, timestamp: createdAt }] });
      } catch (err) {
        console.warn('Failed to send discord webhook:', err?.message || err);
      }
    }

    return {
      instanceId: serverAttrs?.id || serverAttrs?.attributes?.id || 'N/A',
      status: (resp.status === 200 || resp.status === 201) ? 'provisioning' : 'unknown',
      message: 'Bot instance attempted via Pelican',
      response: serverData
    };
  } catch (err) {
    const pelicanResponse = {
      message: err?.message,
      code: err?.code || null,
      status: err?.response?.status || null,
      headers: err?.response?.headers || null,
      data: err?.response?.data || null,
      request: {
        method: err?.config?.method,
        url: err?.config?.url,
        headers: err?.config?.headers,
        data: err?.config?.data
      },
      curl: curlExample
    };
    console.error('❌ Pelican deployment error (full):\n', safeStringify(pelicanResponse));
    const e = new Error('Pelican deployment failed');
    e.pelicanResponse = pelicanResponse;
    throw e;
  }
}

module.exports = {
  deployInstance,
  findUserIdByEmail,
  createPanelUser
};
