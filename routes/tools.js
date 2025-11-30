const express = require('express');
const router = express.Router();
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const tls = require('tls');
const moment = require('moment'); 
const dns = require('dns').promises;

const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// GET /tools/whois
router.get('/whois', async (req, res) => {
  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: 'Domain query required' });

  try {
    const response = await fetch(`https://whois.nexcloud.enterprises/${domain}`);
    if (!response.ok) throw new Error(`WHOIS API error: ${response.statusText}`);
    const data = await response.json();

    // Extract the useful info
    const result = {
      domain: data.domain.domain,
      registrar: data.registrar.name,
      created: data.domain.created_date,
      expires: data.domain.expiration_date,
      updated: data.domain.updated_date,
      nameservers: data.domain.name_servers,
      status: data.domain.status
    };

    res.json(result);
  } catch (err) {
    console.error('WHOIS fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch WHOIS', details: err.message });
  }
});

// GET /tools/dns-lookup
router.get('/dns-lookup', async (req, res) => {
  const { domain, type } = req.query;
  if (!domain) return res.status(400).json({ error: 'Domain query required' });

  // default to ALL if type not provided
  const recordTypes = type
    ? type === 'ALL' 
      ? ['A','AAAA','MX','TXT','NS','CNAME','SOA'] 
      : [type.toUpperCase()]
    : ['A','AAAA','MX','TXT','NS','CNAME','SOA'];

  const results = [];

  // Use public resolvers
  const resolver = new dns.Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);

  try {
    await Promise.all(recordTypes.map(async t => {
      try {
        const records = await resolver.resolve(domain, t);
        records.forEach(r => {
          if (t === 'MX') {
            results.push({ type: t, host: domain, value: r.exchange, priority: r.priority });
          } else if (t === 'SOA') {
            results.push({ type: t, host: domain, value: JSON.stringify(r) });
          } else {
            results.push({ type: t, host: domain, value: r });
          }
        });
      } catch (err) {
        // ignore if record type not found
      }
    }));

    res.json(results);
  } catch (err) {
    console.error('DNS lookup error:', err);
    res.status(500).json({ error: 'Failed to resolve DNS', details: err.message });
  }
});

// GET IP Lookup Endpoint
router.get('/ip-lookup', async (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: 'IP query parameter is required' });

  try {
    // 1️⃣ Run all API fetches in parallel
    const [ip2Data, abuseData, vpnData] = await Promise.all([
      fetch(`https://api.ip2location.io/?key=${process.env.IP2LOCATION_KEY}&ip=${ip}`)
        .then(r => r.json())
        .catch(err => ({ error: err.message })),
      
      fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, {
        headers: {
          Key: process.env.ABUSEIPDB,
          Accept: 'application/json'
        }
      })
        .then(r => r.json())
        .catch(err => ({ error: err.message })),
      
      fetch(`https://vpnapi.io/api/${ip}?key=${process.env.VPNAPI}`)
        .then(r => r.json())
        .catch(err => ({ error: err.message }))
    ]);

    const combined = { ip, geo: ip2Data, abuse: abuseData, privacy: vpnData };

    // 2️⃣ Short, human-readable AI summary
    let aiAnalysis = {};
    try {
      const aiRes = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Provide a **short summary (2-3 sentences)** for IP ${ip} based on this data, focusing on security risk and abuse potential:\n${JSON.stringify(combined)}`
      });
      aiAnalysis.summary = aiRes.text;
    } catch (err) {
      console.error('AI analysis error:', err);
      aiAnalysis.error = err.message;
    }

    // Return combined + AI summary
    res.json({ ...combined, ai: aiAnalysis });
  } catch (err) {
    console.error('General IP lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch IP data', details: err.message });
  }
});

// GET /tools/ssl-check
router.get('/ssl-check', async (req, res) => {
  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: 'Domain query parameter is required' });

  try {
    const socket = tls.connect(443, domain, { servername: domain, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate(true); // get full chain
      const protocol = socket.getProtocol(); // TLS version
      const cipher = socket.getCipher(); // cipher info
      socket.end();

      if (!cert || !cert.valid_to) {
        return res.status(500).json({ error: 'Could not retrieve certificate info' });
      }

      // Format certificate chain
      const chain = [];
      let current = cert;
      while (current) {
        chain.push({
          subject: current.subject.CN,
          issuer: current.issuer.CN,
          validFrom: current.valid_from,
          validTo: current.valid_to
        });
        current = current.issuerCertificate === current ? null : current.issuerCertificate;
      }

      res.json({
        domain,
        valid: new Date(cert.valid_to) > new Date(),
        issuer: cert.issuer.CN,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        daysRemaining: Math.ceil((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24)),
        protocol,
        cipher: cipher ? cipher.name : undefined,
        certificateChain: chain
      });
    });

    socket.on('error', (err) => {
      res.status(500).json({ error: 'TLS connection failed', details: err.message });
    });

  } catch (err) {
    res.status(500).json({ error: 'SSL check failed', details: err.message });
  }
});

module.exports = router;
