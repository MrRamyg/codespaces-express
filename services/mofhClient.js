const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: { rejectUnauthorized: false }
});

const MOFH_USER = process.env.MOFH_API_USER;
const MOFH_KEY = process.env.MOFH_API_KEY;
const MOFH_BASE = 'https://api.myownfreehost.net/JSON';

async function getFullAccountInfo(vpusername) {
  const dbRes = await pool.query(
    'SELECT * FROM hosting_accounts WHERE account_username = $1',
    [vpusername]
  );

  if (dbRes.rows.length > 0) {
    const account = dbRes.rows[0];
    return {
      account_id: account.account_id,
      account_label: account.account_label,
      account_username: account.account_username,
      account_status: account.account_status,
      account_sql: account.account_sql,
      account_key: account.account_key,
      account_for: account.account_for,
      account_time: account.account_time,
      account_domain: account.account_domain,
      account_main: account.account_main,
      userDomains: [], 
    };
  }

  let userDomains = [];
  try {
    const resp = await axios.get(`${MOFH_BASE}/getUserDomains`, {
      params: { username: vpusername, api_user: MOFH_USER, api_key: MOFH_KEY },
      timeout: 10000,
    });
    if (resp.data) {
      const arr = resp.data.split(',');
      for (let i = 0; i < arr.length; i += 2) {
        userDomains.push({ status: arr[i], domain: arr[i + 1] });
      }
    }
  } catch {}

  return {
    account_id: null,
    account_label: null,
    account_username: vpusername,
    account_status: null,
    account_sql: null,
    account_key: null,
    account_for: null,
    account_time: null,
    account_domain: null,
    account_main: null,
    userDomains,
  };
}

async function createAccount({ username, password, email, domain, plan }) {
  const resp = await axios.get(`${MOFH_BASE}/createAccount`, {
    params: { username, password, email, domain, plan, api_user: MOFH_USER, api_key: MOFH_KEY },
    timeout: 15000,
  });

  const insertRes = await pool.query(
    `INSERT INTO hosting_accounts
      (account_label, account_username, account_password, account_status, account_key, account_for, account_time, account_domain, account_main)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8)
     ON CONFLICT (account_username) DO UPDATE 
     SET account_password = EXCLUDED.account_password,
         account_label = EXCLUDED.account_label,
         account_status = EXCLUDED.account_status,
         account_key = EXCLUDED.account_key`,
    [domain, username, password, 'active', email, null, domain, true]
  );

  const dbRes = await pool.query(
    'SELECT * FROM hosting_accounts WHERE account_username = $1',
    [username]
  );

  const account = dbRes.rows[0];

  return {
    source: 'mofh',
    account: {
      account_id: account.account_id,
      account_label: account.account_label,
      account_username: account.account_username,
      account_password: account.account_password,
      account_status: account.account_status,
      account_sql: account.account_sql,
      account_key: account.account_key,
      account_for: account.account_for,
      account_time: account.account_time,
      account_domain: account.account_domain,
      account_main: account.account_main,
      userDomains: [], 
    },
    apiResult: resp.data
  };
}

async function suspendAccount(vpusername, reason) {
  if (!reason) reason = 'Suspended via API';

  const resp = await axios.post(
    'https://panel.myownfreehost.net/json-api/suspendacct.php',
    new URLSearchParams({ user: vpusername, reason }).toString(),
    {
      auth: { username: MOFH_USER, password: MOFH_KEY },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );

  await pool.query(
    'UPDATE hosting_accounts SET account_status = $1 WHERE account_username = $2',
    ['suspended', vpusername]
  );

  return resp.data;
}

async function unsuspendAccount(vpusername) {

  const resp = await axios.post(
    'https://panel.myownfreehost.net/json-api/unsuspendacct.php',
    new URLSearchParams({ user: vpusername }).toString(),
    {
      auth: { username: MOFH_USER, password: MOFH_KEY },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );

  await pool.query(
    'UPDATE hosting_accounts SET account_status = $1 WHERE account_username = $2',
    ['active', vpusername]
  );

  return resp.data;
}

async function checkDomainAvailability(domain) {
  if (!domain) throw new Error('Domain is required');

  const resp = await axios.post(
    'https://panel.myownfreehost.net/json-api/checkavailable.php',
    new URLSearchParams({ api_user: MOFH_USER, api_key: MOFH_KEY, domain }).toString(),
    {
      auth: { username: MOFH_USER, password: MOFH_KEY },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );

  // API returns plain integer 0 or 1
  const available = parseInt(resp.data, 10);
  return available === 1;
}

async function getUserDomainsXML(vpusername) {
  const resp = await axios.post('https://panel.myownfreehost.net/xml-api/getuserdomains.php', null, {
    params: {
      api_user: MOFH_USER,
      api_key: MOFH_KEY,
      username: vpusername
    },
    timeout: 10000
  });

  if (!resp.data) return [];

  // Convert array of arrays to array of objects
  return resp.data.map(([status, domain]) => ({ status, domain }));
}


module.exports = {
  getFullAccountInfo,
  createAccount,
  suspendAccount,
  unsuspendAccount,
  checkDomainAvailability,
  getUserDomainsXML
};
