const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');
const xml2js = require('xml2js');
const aiClient = require('../utils/ai');

const NAMESILO_KEY = process.env.NAMESILO_API_KEY;
if (!NAMESILO_KEY) {
  console.warn('Warning: NAMESILO_API_KEY not set. NameSilo endpoints will fail until key is provided.');
}

const NAMESILO_BASE = 'https://www.namesilo.com/api/'; // NameSilo API base

// helper to call NameSilo and return parsed JS object
async function callNameSilo(apiMethod, params = {}) {
  if (!NAMESILO_KEY) {
    throw new Error('Missing NameSilo API key (NAMESILO_API_KEY).');
  }

  const urlParams = new URLSearchParams({
    version: '1',
    type: 'xml',
    key: NAMESILO_KEY,
    ...params
  });

  const url = `${NAMESILO_BASE}${apiMethod}?${urlParams.toString()}`;

  const resp = await axios.get(url, { timeout: 10000, responseType: 'text' });
  // parse XML into JS object (merge attributes so price/premium come through)
  const parsed = await xml2js.parseStringPromise(resp.data, {
    explicitArray: false,
    mergeAttrs: true,
    trim: true
  });
  return parsed;
}

// normalize domain entry returned by NameSilo into a predictable object
function normalizeDomainEntry(domainNode) {
  // domainNode can be:
  // - a string (domain name)
  // - an object with text content in '_' or as direct text and attributes like price, premium, duration
  if (!domainNode) return null;

  if (typeof domainNode === 'string') {
    return { domain: domainNode };
  }

  // when mergeAttrs=true and explicitArray=false, xml2js tends to return:
  // { _: 'example.com', price: '9.99', premium: 'false', duration: '1' }
  const name = domainNode._ || domainNode['#'] || Object.values(domainNode).find(v => typeof v === 'string') || '';
  return {
    domain: name,
    price: domainNode.price !== undefined ? parseFloat(domainNode.price) : null,
    premium: domainNode.premium === 'true' || domainNode.premium === '1' || domainNode.premium === 1 || domainNode.premium === 'yes' || false,
    duration: domainNode.duration ? String(domainNode.duration) : undefined
  };
}




router.get('/check', async (req, res) => {
  try {
    const rawDomains = (req.query.domains || req.query.q || '').toString().trim();
    if (!rawDomains) return res.status(400).json({ error: 'Missing query param: domains or q' });

    const domains = rawDomains.split(',').map(d => d.trim()).filter(Boolean);
    const type = (req.query.type || 'register').toString().toLowerCase();
    const apiMethod = type === 'transfer'
      ? 'checkTransferAvailability'
      : 'checkRegisterAvailability';

    console.log('Domains to check:', domains, 'Type:', apiMethod);

    // --- 1) NameSilo availability ---
    const parsed = await callNameSilo(apiMethod, { domains: domains.join(',') });
    const reply = parsed?.namesilo?.reply || {};
    console.log('NameSilo reply:', reply);

    const result = {
      request: { type: apiMethod, domains },
      available: [],
      unavailable: [],
      invalid: [],
      suggestions: [],
      raw: reply
    };

    // normalize NameSilo responses
    if (reply.available?.domain) {
      const nodes = Array.isArray(reply.available.domain) ? reply.available.domain : [reply.available.domain];
      result.available = nodes.map(normalizeDomainEntry).filter(Boolean);
    }
    if (reply.unavailable?.domain) {
      const nodes = Array.isArray(reply.unavailable.domain) ? reply.unavailable.domain : [reply.unavailable.domain];
      result.unavailable = nodes.map(n => (typeof n === 'string' ? { domain: n } : { domain: n._ || n }));
    }
    if (reply.invalid?.domain) {
      const nodes = Array.isArray(reply.invalid.domain) ? reply.invalid.domain : [reply.invalid.domain];
      result.invalid = nodes.map(n => (typeof n === 'string' ? { domain: n } : { domain: n._ || n }));
    }

    // --- 2) AI suggestions ---
    const primary = domains[0];
    const promptText = `
Generate 10 short, brandable domain name recommendations similar to "${primary}".
Prefer .com, .net, .org, .io, .dev, .me, .cloud.
Output ONLY a JSON array of strings.
Example: ["example.io","getexample.com","examplecloud.net"]
    `.trim();

    let aiSuggestions = [];

    // helper: parse JSON array safely
    function parseJsonArrayFromText(text) {
      if (!text || typeof text !== 'string') return null;
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
      const first = text.indexOf('[');
      const last = text.lastIndexOf(']');
      if (first !== -1 && last !== -1 && last > first) {
        try {
          const parsed = JSON.parse(text.slice(first, last + 1));
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {}
      }
      return null;
    }

    // better fallback: strip TLD from input
    function fallbackSuggestions(name) {
      const base = name.replace(/^www\./i, '').replace(/\.[^.]+$/, ''); // remove existing TLD
      const variants = [
        `${base}.com`,
        `${base}.net`,
        `${base}.org`,
        `${base}.io`,
        `${base}.dev`,
        `${base}.me`,
        `get${base}.com`,
        `${base}cloud.com`,
        `${base}hub.io`,
        `${base}app.dev`
      ];
      return Array.from(new Set(variants)).slice(0, 10);
    }

    // try AI first
    try {
      if (aiClient) {
        const modelName = 'models/gemini-2.5-flash';
        let text = null;

        if (typeof aiClient.generateText === 'function') {
          const resp = await aiClient.generateText({
            model: modelName,
            prompt: promptText,
            temperature: 0.7,
            maxOutputTokens: 200
          });
          text = resp?.output?.[0]?.content?.[0]?.text || resp?.candidates?.[0]?.output || resp?.text;
        } else if (typeof aiClient.getGenerativeModel === 'function') {
          const model = aiClient.getGenerativeModel({ model: modelName });
          if (model?.generateContent) {
            const resp = await model.generateContent({ prompt: { text: promptText }, maxOutputTokens: 200 });
            text = resp?.response?.text ? resp.response.text() : resp?.candidates?.[0]?.output || null;
          } else if (model?.generate) {
            const resp = await model.generate({ prompt: promptText, maxOutputTokens: 200 });
            text = resp?.output?.[0]?.content?.[0]?.text || resp?.candidates?.[0]?.output || null;
          }
        }

        console.log('AI raw text:', text);

        const parsed = parseJsonArrayFromText(text);
        if (parsed) {
          aiSuggestions = parsed.map(s => String(s).trim());
        }
      }
    } catch (aiErr) {
      console.error('AI suggestion failed — using fallback:', aiErr?.message || aiErr);
    }

    // fallback if AI fails
    if (!aiSuggestions.length) {
      aiSuggestions = fallbackSuggestions(primary);
      console.log('Fallback suggestions used:', aiSuggestions);
    }

    result.suggestions = aiSuggestions;

    return res.json(result);

  } catch (err) {
    console.error('Domain check error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to check domains', message: err?.message || String(err) });
  }
});





// GET /:domain/whois (Continue later, needs database for per user domain lookup thing)
router.get('/:domain/whois', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) return res.status(400).json({ error: 'Missing domain param' });

    console.log(`Fetching WHOIS info for domain: ${domain}`);

    const parsed = await callNameSilo('getDomainInfo', { domain });
    const reply = parsed?.namesilo?.reply;

    if (!reply) {
      console.warn('Invalid response from NameSilo:', parsed);
      return res.status(502).json({ error: 'Invalid response from NameSilo', raw: parsed });
    }

    // normalize some key fields for easier consumption
    const whoisData = {
      domain: reply.domain || domain,
      created: reply.created || null,
      expires: reply.expires || null,
      updated: reply.updated || null,
      registrar: reply.registrar || 'NameSilo',
      status: reply.status || null,
      contact: {
        registrant: reply.registrant || null,
        admin: reply.admin || null,
        tech: reply.tech || null,
        billing: reply.billing || null
      },
      raw: reply // full raw data included for debugging
    };

    console.log('WHOIS data parsed:', whoisData);

    return res.json(whoisData);

  } catch (err) {
    console.error('NameSilo getDomainInfo error:', err?.message || err);
    return res.status(500).json({
      error: 'Failed to fetch domain info',
      message: err?.message || String(err)
    });
  }
});


// GET - Domains from internal DB not namesilo api, for per user domain.
router.get('/', (req, res) => {
  res.json([
    {
      id: 1,
      name: 'example.com',
      status: 'active',
      expires: '2025-12-28',
      autoRenew: true,
      privacy: true,
      locked: true,
      nameservers: ['ns1.example.com', 'ns2.example.com']
    },
    {
      id: 2,
      name: 'mydomain.net',
      status: 'active',
      expires: '2025-06-15',
      autoRenew: false,
      privacy: false,
      locked: false,
      nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com']
    }
  ]);
});

// GET /auctions - fetch active auctions from NameSilo
router.get('/auctions', async (req, res) => {
  try {
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NameSilo API key missing' });

    const url = `${NAMESILO_BASE}marketplaceActiveSalesOverview?version=1&type=xml&key=${NAMESILO_KEY}`;
    const response = await axios.get(url, { timeout: 10000, responseType: 'text' });
    const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false, mergeAttrs: true, trim: true });
    
    const auctions = parsed?.namesilo?.reply?.auction;
    if (!auctions) return res.status(502).json({ error: 'No auctions found', raw: parsed });

    // ensure array
    const list = Array.isArray(auctions) ? auctions : [auctions];

    res.json(list);
  } catch (err) {
    console.error('NameSilo auctions error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch auctions', message: err?.message || String(err) });
  }
});

// POST /auctions/:id/bid - place bid on NameSilo auction
router.post('/auctions/:id/bid', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    if (!id || !amount) return res.status(400).json({ error: 'Missing auction id or bid amount' });
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NSlo API key missing' });

    const url = `${NAMESILO_BASE}auctionBid?version=1&type=xml&key=${NAMESILO_KEY}&auctionId=${id}&bidAmount=${amount}`;
    const response = await axios.get(url, { timeout: 10000, responseType: 'text' });
    const parsed = await xml2js.parseStringPromise(response.data, { explicitArray: false, mergeAttrs: true, trim: true });
    const reply = parsed?.namesilo?.reply;

    if (!reply) return res.status(502).json({ error: 'Invalid response from NameSilo', raw: parsed });
    if (reply.code !== '300') return res.status(400).json({ error: 'Bid failed', message: reply.detail });

    res.json({ success: true, auctionId: id, yourBid: amount, message: reply.detail, raw: reply });
  } catch (err) {
    console.error('NameSilo bid error:', err?.message || err);
    res.status(500).json({ error: 'Failed to place bid', message: err?.message || String(err) });
  }
});


// GET /:domain - get detailed domain info from NameSilo
router.get('/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    if (!domain) return res.status(400).json({ error: 'Missing domain param' });
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NameSilo API key missing' });

    const parsed = await callNameSilo('getDomainInfo', { domain });
    const reply = parsed?.namesilo?.reply;
    if (!reply) return res.status(502).json({ error: 'Invalid response from NameSilo', raw: parsed });

    const domainInfo = reply?.domain;
    if (!domainInfo) return res.status(404).json({ error: 'Domain not found', raw: reply });

    // normalize fields
    const info = {
      name: domainInfo._ || domain,
      status: domainInfo.status || null,
      created: domainInfo.create_date || null,
      expires: domainInfo.expire_date || null,
      updated: domainInfo.update_date || null,
      autoRenew: domainInfo.auto_renew === '1',
      privacy: domainInfo.privacy === '1',
      locked: domainInfo.locked === '1',
      nameservers: domainInfo.nameservers?.nameserver
        ? Array.isArray(domainInfo.nameservers.nameserver)
          ? domainInfo.nameservers.nameserver
          : [domainInfo.nameservers.nameserver]
        : [],
      forwarding: {
        trafficType: domainInfo.traffic_type || 'N/A',
        forwardUrl: domainInfo.forward_url || 'N/A',
        forwardType: domainInfo.forward_type || 'N/A'
      },
      emailVerificationRequired: domainInfo.email_verification_required === 'yes',
      contactIds: domainInfo.contact_ids || null,
      contactInfo: {
        registrant: domainInfo.registrant || null,
        admin: domainInfo.admin || null,
        tech: domainInfo.tech || null,
        billing: domainInfo.billing || null
      },
      raw: reply
    };

    res.json(info);
  } catch (err) {
    console.error('NameSilo getDomainInfo error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch domain info', message: err?.message || String(err) });
  }
});

// ---------- NameSilo domain operations (real API passthrough) ----------

// GET /prices?currency=USD&years=1
router.get('/prices', async (req, res) => {
  try {
    const params = { ...(req.query || {}) };
    const parsed = await callNameSilo('getPrices', params);
    return res.json(parsed?.namesilo?.reply || parsed);
  } catch (err) {
    console.error('getPrices error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch prices', message: err?.message || String(err) });
  }
});

// POST /register  { domain, years, private, autoRenew, ... }
router.post('/register', async (req, res) => {
  try {
    const params = { ...(req.body || {}) };
    if (!params.domain) return res.status(400).json({ error: 'Missing domain in body' });

    const parsed = await callNameSilo('registerDomain', params);
    return res.json(parsed?.namesilo?.reply || parsed);
  } catch (err) {
    console.error('registerDomain error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to register domain', message: err?.message || String(err) });
  }
});

// POST /register-drop  { domain, years }
router.post('/register-drop', async (req, res) => {
  try {
    const params = { ...(req.body || {}) };
    if (!params.domain) return res.status(400).json({ error: 'Missing domain in body' });

    const parsed = await callNameSilo('registerDomainDrop', params);
    return res.json(parsed?.namesilo?.reply || parsed);
  } catch (err) {
    console.error('registerDomainDrop error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to register drop', message: err?.message || String(err) });
  }
});

// POST /claims  { domain, details... }  (Domain Claims endpoint)
router.post('/claims', async (req, res) => {
  try {
    const params = { ...(req.body || {}) };
    if (!params.domain) return res.status(400).json({ error: 'Missing domain in body' });

    const parsed = await callNameSilo('domainClaims', params);
    return res.json(parsed?.namesilo?.reply || parsed);
  } catch (err) {
    console.error('domainClaims error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to create domain claim', message: err?.message || String(err) });
  }
});

// POST /renew  { domain, years }
router.post('/renew', async (req, res) => {
  try {
    const params = { ...(req.body || {}) };
    if (!params.domain || !params.years) return res.status(400).json({ error: 'Missing domain or years' });

    const parsed = await callNameSilo('renewDomain', params);
    return res.json(parsed?.namesilo?.reply || parsed);
  } catch (err) {
    console.error('renewDomain error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to renew domain', message: err?.message || String(err) });
  }
});

// POST /transfer  { domain, transferCode, years }
router.post('/transfer', async (req, res) => {
  try {
    const params = { ...(req.body || {}) };
    if (!params.domain || !params.transferCode) return res.status(400).json({ error: 'Missing domain or transferCode' });

    const parsed = await callNameSilo('transferDomain', params);
    return res.json(parsed?.namesilo?.reply || parsed);
  } catch (err) {
    console.error('transferDomain error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to transfer domain', message: err?.message || String(err) });
  }
});


// POST /:domain/forward - Forward a domain using NameSilo API
router.post('/:domain/forward', async (req, res) => {
  try {
    const domain = req.params.domain;
    const { protocol, address, method, meta_title, meta_description, meta_keywords } = req.body;

    if (!domain || !protocol || !address || !method) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['protocol', 'address', 'method']
      });
    }

    const params = {
      domain,
      protocol,
      address,
      method,
      ...(meta_title ? { meta_title } : {}),
      ...(meta_description ? { meta_description } : {}),
      ...(meta_keywords ? { meta_keywords } : {})
    };

    const parsed = await callNameSilo('domainForward', params);
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('domainForward error:', err?.message || err);
    return res.status(500).json({ 
      error: 'Failed to set domain forward', 
      message: err?.message || String(err) 
    });
  }
});


// POST /:domain/forward/:subdomain - Forward a subdomain using NameSilo API
router.post('/:domain/forward/:subdomain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const subDomain = req.params.subdomain;
    const { protocol, address, method, meta_title, meta_description, meta_keywords } = req.body;

    if (!domain || !subDomain || !protocol || !address || !method) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['protocol', 'address', 'method']
      });
    }

    const params = {
      domain,
      sub_domain: subDomain,  // note NameSilo uses sub_domain
      protocol,
      address,
      method,
      ...(meta_title ? { meta_title } : {}),
      ...(meta_description ? { meta_description } : {}),
      ...(meta_keywords ? { meta_keywords } : {})
    };

    const parsed = await callNameSilo('domainForwardSubDomain', params);
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('domainForwardSubDomain error:', err?.message || err);
    return res.status(500).json({ 
      error: 'Failed to set subdomain forward', 
      message: err?.message || String(err) 
    });
  }
});


// DELETE /:domain/forward/:subdomain - Delete a subdomain forward
router.delete('/:domain/forward/:subdomain', async (req, res) => {
  try {
    const domain = req.params.domain;
    const subDomain = req.params.subdomain;

    if (!domain || !subDomain) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['domain', 'subdomain']
      });
    }

    const params = {
      domain,
      sub_domain: subDomain // matches NameSilo API
    };

    const parsed = await callNameSilo('domainForwardSubDomainDelete', params);
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('domainForwardSubDomainDelete error:', err?.message || err);
    return res.status(500).json({ 
      error: 'Failed to delete subdomain forward', 
      message: err?.message || String(err) 
    });
  }
});


// POST /:domain/auto-renew - Add Auto Renewal
router.post('/:domain/auto-renew', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) {
      return res.status(400).json({ error: 'Missing domain parameter' });
    }

    const parsed = await callNameSilo('addAutoRenewal', { domain });
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('addAutoRenewal error:', err?.message || err);
    return res.status(500).json({ 
      error: 'Failed to add auto renewal', 
      message: err?.message || String(err) 
    });
  }
});


// DELETE /:domain/auto-renew - Remove Auto Renewal
router.delete('/:domain/auto-renew', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) {
      return res.status(400).json({ error: 'Missing domain parameter' });
    }

    const parsed = await callNameSilo('removeAutoRenewal', { domain });
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('removeAutoRenewal error:', err?.message || err);
    return res.status(500).json({ 
      error: 'Failed to remove auto renewal', 
      message: err?.message || String(err) 
    });
  }
});


// POST /:domain/lock
router.post('/:domain/lock', async (req, res) => {
  try {
    const domain = req.params.domain;
    const parsed = await callNameSilo('domainLock', { domain });
    return res.json(parsed?.namesilo?.reply || parsed);
  } catch (err) {
    console.error('domainLock error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to lock domain', message: err?.message || String(err) });
  }
});

// POST /:domain/unlock - Unlock a Domain
router.post('/:domain/unlock', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) {
      return res.status(400).json({ error: 'Missing domain parameter' });
    }

    const parsed = await callNameSilo('domainUnlock', { domain });
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('domainUnlock error:', err?.message || err);
    return res.status(500).json({
      error: 'Failed to unlock domain',
      message: err?.message || String(err)
    });
  }
});


// POST /:domain/push - Push a domain to another account
router.post('/:domain/push', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) return res.status(400).json({ error: 'Missing domain parameter' });

    const { recipientLogin } = req.body;
    if (!recipientLogin) return res.status(400).json({ error: 'Missing recipientLogin in request body' });

    const params = { domain, recipientLogin };
    const parsed = await callNameSilo('domainPush', params);

    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('domainPush error:', err?.message || err);
    return res.status(500).json({
      error: 'Failed to push domain',
      message: err?.message || String(err)
    });
  }
});


// -------------- Name Servers ---------------------


// GET /:domain/registered-nameservers - List Registered NameServers
router.get('/:domain/registered-nameservers', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) return res.status(400).json({ error: 'Missing domain parameter' });

    const parsed = await callNameSilo('listRegisteredNameServers', { domain });
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('listRegisteredNameServers error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to list registered nameservers', message: err?.message || String(err) });
  }
});

// PUT /:domain/nameservers - Change NameServers
router.put('/:domain/nameservers', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) return res.status(400).json({ error: 'Missing domain parameter' });

    const nameservers = req.body?.nameservers;
    if (!Array.isArray(nameservers) || nameservers.length < 2 || nameservers.length > 13) {
      return res.status(400).json({ error: 'You must provide between 2 and 13 nameservers' });
    }

    // Convert array to ns1, ns2, ... ns13
    const params = { domain };
    nameservers.forEach((ns, idx) => {
      params[`ns${idx + 1}`] = ns;
    });

    const parsed = await callNameSilo('changeNameServers', params);
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('changeNameServers error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to change nameservers', message: err?.message || String(err) });
  }
});

// PUT /:domain/registered-nameserver - Modify a Registered NameServer
router.put('/:domain/registered-nameserver', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) return res.status(400).json({ error: 'Missing domain parameter' });

    const { current_host, new_host, ip1, ...otherIps } = req.body;
    if (!current_host || !new_host || !ip1) {
      return res.status(400).json({ error: 'Missing required fields: current_host, new_host, ip1' });
    }

    const params = { domain, current_host, new_host, ip1, ...otherIps };
    const parsed = await callNameSilo('modifyRegisteredNameServer', params);
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('modifyRegisteredNameServer error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to modify registered nameserver', message: err?.message || String(err) });
  }
});

// DELETE /:domain/registered-nameserver - Delete a Registered NameServer
router.delete('/:domain/registered-nameserver', async (req, res) => {
  try {
    const domain = req.params.domain?.trim();
    if (!domain) return res.status(400).json({ error: 'Missing domain parameter' });

    const { current_host } = req.body;
    if (!current_host) return res.status(400).json({ error: 'Missing current_host in request body' });

    const parsed = await callNameSilo('deleteRegisteredNameServer', { domain, current_host });
    return res.json(parsed?.namesilo?.reply || parsed);

  } catch (err) {
    console.error('deleteRegisteredNameServer error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to delete registered nameserver', message: err?.message || String(err) });
  }
});
// -- DNS ---

router.get('/:domain/dns', async (req, res) => {
  try {
    const { domain } = req.params;
    if (!domain) return res.status(400).json({ error: 'Missing domain parameter' });
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NameSilo API key missing' });

    const parsed = await callNameSilo('listDNSRecords', { domain });
    const records = parsed?.namesilo?.reply?.resource_record || [];
    
    const result = Array.isArray(records) ? records : [records];
    res.json(result);
  } catch (err) {
    console.error('listDNSRecords error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch DNS records', message: err?.message || String(err) });
  }
});


// POST /:domain/dns - Add a new DNS record
router.post('/:domain/dns', async (req, res) => {
  try {
    const { domain } = req.params;
    const { type, host, value, ttl = 7207, priority, distance } = req.body;

    if (!domain || !type || !host || !value) {
      return res.status(400).json({ error: 'Missing required fields: type, host, value' });
    }
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NameSilo API key missing' });

    const params = {
      domain,
      rrtype: type,
      rrhost: host,
      rrvalue: value,
      rrttl: ttl
    };

    if (type === 'MX' && distance !== undefined) params.rrdistance = distance;

    const parsed = await callNameSilo('dnsAddRecord', params);
    const reply = parsed?.namesilo?.reply;

    if (!reply) return res.status(502).json({ error: 'Invalid response from NameSilo', raw: parsed });

    const recordId = reply?.record_id || null;

    res.json({
      success: true,
      domain,
      recordId,
      type,
      host,
      value,
      ttl,
      priority,
      message: 'DNS record created successfully',
      raw: reply
    });
  } catch (err) {
    console.error('dnsAddRecord error:', err?.message || err);
    res.status(500).json({ error: 'Failed to add DNS record', message: err?.message || String(err) });
  }
});


// PUT /:domain/dns/:recordId - Update an existing DNS record
router.put('/:domain/dns/:recordId', async (req, res) => {
  try {
    const { domain, recordId } = req.params;
    const { type, host, value, ttl = 7207, distance } = req.body;

    if (!domain || !recordId || !type || !host || !value) {
      return res.status(400).json({ error: 'Missing required fields: type, host, value, recordId' });
    }
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NameSilo API key missing' });

    const params = {
      domain,
      rrid: recordId,
      rrtype: type,
      rrhost: host,
      rrvalue: value,
      rrttl: ttl
    };

    if (type === 'MX' && distance !== undefined) params.rrdistance = distance;

    const parsed = await callNameSilo('dnsUpdateRecord', params);
    const reply = parsed?.namesilo?.reply;

    if (!reply) return res.status(502).json({ error: 'Invalid response from NameSilo', raw: parsed });

    const newRecordId = reply?.record_id || null;

    res.json({
      success: true,
      domain,
      oldRecordId: recordId,
      newRecordId,
      type,
      host,
      value,
      ttl,
      distance,
      message: 'DNS record updated successfully',
      raw: reply
    });
  } catch (err) {
    console.error('dnsUpdateRecord error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update DNS record', message: err?.message || String(err) });
  }
});


// DELETE /:domain/dns/:recordId - Delete a DNS record
router.delete('/:domain/dns/:recordId', async (req, res) => {
  try {
    const { domain, recordId } = req.params;

    if (!domain || !recordId) {
      return res.status(400).json({ error: 'Missing required params: domain or recordId' });
    }
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NameSilo API key missing' });

    const parsed = await callNameSilo('dnsDeleteRecord', {
      domain,
      rrid: recordId
    });

    const reply = parsed?.namesilo?.reply;

    if (!reply) return res.status(502).json({ error: 'Invalid response from NameSilo', raw: parsed });

    res.json({
      success: true,
      domain,
      deletedRecordId: recordId,
      message: 'DNS record deleted successfully',
      raw: reply
    });
  } catch (err) {
    console.error('dnsDeleteRecord error:', err?.message || err);
    res.status(500).json({ error: 'Failed to delete DNS record', message: err?.message || String(err) });
  }
});


// GET /:domain/auth-code - Retrieve EPP/Auth code
router.get('/:domain/auth-code', async (req, res) => {
  try {
    const { domain } = req.params;

    if (!domain) return res.status(400).json({ error: 'Missing domain param' });
    if (!NAMESILO_KEY) return res.status(500).json({ error: 'NameSilo API key missing' });

    const parsed = await callNameSilo('retrieveAuthCode', { domain });
    const reply = parsed?.namesilo?.reply;

    if (!reply) return res.status(502).json({ error: 'Invalid response from NameSilo', raw: parsed });

    res.json({
      success: true,
      domain,
      authCode: reply.auth_code || null,
      message: reply.detail || 'EPP/Auth code retrieved successfully',
      raw: reply
    });
  } catch (err) {
    console.error('retrieveAuthCode error:', err?.message || err);
    res.status(500).json({ error: 'Failed to retrieve auth code', message: err?.message || String(err) });
  }
});



router.use(authenticateToken);

module.exports = router;
