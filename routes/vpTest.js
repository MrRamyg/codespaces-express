const express = require("express");
const router = express.Router();
const VistaPanelAPI = require("../services/vistapanelWrapper");

router.get("/vp-info", async (req, res) => {
  const { u: username, p: password } = req.query;

  if (!username || !password) {
    return res.status(400).json({
      error: "Missing credentials",
      details: "You must provide ?u=<username>&p=<password> in the query string",
    });
  }

  const vp = new VistaPanelAPI("https://cpanel.js4u.site");

  try {
    await vp.login(username, password);

    const info = await vp.getPanelInfo();

    await vp.logout();

    res.json({
      username: info.username,
      databases: info.databases,
      domains: info.domains,
      ftp: info.ftp,
      softaculous: info.softaculous,
      stats: info.stats,
      timestamp: info.timestamp,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch VP info",
      details: err.message,
    });
  }
});

module.exports = router;
