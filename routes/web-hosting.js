const express = require('express');
const router = express.Router();
const { 
  getFullAccountInfo, 
  createAccount, 
  suspendAccount, 
  unsuspendAccount,
  checkDomainAvailability 
} = require('../services/mofhClient');


router.get('/full-account', async (req, res) => {
  const { vpusername } = req.query;
  if (!vpusername) return res.status(400).json({ error: 'vpusername required' });

  try {
    const account = await getFullAccountInfo(vpusername);
    return res.json({ source: 'mofh', account });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch full account info', details: err.message });
  }
});

router.post('/accounts/create', async (req, res) => {
  try {
    const { domain, password, plan, username, contactemail } = req.body;
    if (!domain || !password || !username || !contactemail) {
      return res.status(400).json({ error: 'username, password, contactemail and domain required' });
    }

    const result = await createAccount({ username, password, email: contactemail, domain, plan });
    return res.status(201).json(result);
  } catch (err) {
    console.error('POST /accounts/create error', err);
    res.status(500).json({ error: 'Failed to create account', details: err.message || err });
  }
});

// Suspend
router.post('/accounts/:vpusername/suspend', async (req, res) => {
  try {
    const { vpusername } = req.params;
    const { reason } = req.body;
    if (!vpusername) return res.status(400).json({ error: 'vpusername required' });

    const result = await suspendAccount(vpusername, reason);
    return res.json({ source: 'mofh', action: 'suspend', result });
  } catch (err) {
    console.error('Suspend error', err);
    return res.status(500).json({ error: 'Failed to suspend account', details: err.message });
  }
});

// Unsuspend
router.post('/accounts/:vpusername/unsuspend', async (req, res) => {
  try {
    const { vpusername } = req.params;
    if (!vpusername) return res.status(400).json({ error: 'vpusername required' });

    const result = await unsuspendAccount(vpusername);
    return res.json({ source: 'mofh', action: 'unsuspend', result });
  } catch (err) {
    console.error('Unsuspend error', err);
    return res.status(500).json({ error: 'Failed to unsuspend account', details: err.message });
  }
});

router.get('/accounts/check-domain', async (req, res) => {
  try {
    const { domain } = req.query;
    if (!domain) return res.status(400).json({ error: 'domain required' });

    const available = await checkDomainAvailability(domain);
    return res.json({ domain, available });
  } catch (err) {
    console.error('Domain check error', err);
    return res.status(500).json({ error: 'Failed to check domain', details: err.message });
  }
});

router.get('/accounts/domains', async (req, res) => {
  const { vpusername } = req.query;
  if (!vpusername) return res.status(400).json({ error: 'vpusername required' });

  try {
    const domains = await mofh.getUserDomainsXML(vpusername);
    res.json({ source: 'mofh', domains });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch domains', details: err.message });
  }
});

module.exports = router;
