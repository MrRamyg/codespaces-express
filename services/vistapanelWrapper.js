// services/vistapanelWrapper.js
const axios = require("axios");
const cheerio = require("cheerio");

class VistaPanelAPI {
  constructor(panelUrl) {
    if (!panelUrl) throw new Error("Panel URL is required");
    this.panelUrl = panelUrl.replace(/\/$/, "");
    this.loggedIn = false;
    this.username = "";
    this.panelPassword = "";
    this.sessionCookies = {};
    this.axiosInstance = axios.create({
      baseURL: this.panelUrl,
      validateStatus: null,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:112.0) Gecko/20100101 Firefox/112.0",
      },
    });
  }

  _getCookieHeader() {
    return Object.entries(this.sessionCookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  async _request(method, path, data = null, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const cookieHeader = this._getCookieHeader();
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    const res = await this.axiosInstance.request({
      method,
      url: path,
      data,
      headers,
      maxRedirects: 0,
    });

    if (res.headers["set-cookie"]) {
      res.headers["set-cookie"].forEach((c) => {
        const [pair] = c.split(";");
        const [k, v] = pair.split("=");
        this.sessionCookies[k] = v;
      });
    }

    return res;
  }

  _checkLogin() {
    if (!this.loggedIn) throw new Error("Not logged in");
  }

  // ---------------- LOGIN ----------------
  async login(username, password, theme = "PaperLantern") {
    if (!username || !password) throw new Error("Username and password required");
    this.panelPassword = password;

    const res = await this._request(
      "POST",
      "/login.php",
      new URLSearchParams({
        uname: username,
        passwd: password,
        theme,
        seeesurf: "567811917014474432",
      }),
      { "Content-Type": "application/x-www-form-urlencoded" }
    );

    if (!this.sessionCookies["PHPSESSID"]) {
      throw new Error("Login failed: invalid credentials or account suspended");
    }

    this.loggedIn = true;
    this.username = username;

    const homeRes = await this._request("GET", "/panel/indexpl.php");
    if (homeRes.data.includes("Please click 'I Approve' below")) {
      throw new Error("Please approve or disapprove notifications first.");
    }

    return true;
  }

  // ---------------- DATABASES ----------------
  async listDatabases() {
    this._checkLogin();
    const res = await this._request("GET", "/panel/indexpl.php?option=pma");
    const $ = cheerio.load(res.data);

    const databases = [];
    $("table tr").each((_, tr) => {
      const dbName = $(tr).find("td").first().text().trim();
      if (dbName) databases.push(dbName.replace(`${this.username}_`, ""));
    });
    return databases;
  }

  // ---------------- DOMAINS ----------------
  async listDomains() {
    this._checkLogin();
    const res = await this._request("GET", "/panel/indexpl.php");
    const $ = cheerio.load(res.data);

    const domains = new Set();
    $("a").each((_, el) => {
      const text = $(el).text().trim();
      if (!text) return;
      if (/^[\w.-]+\.[a-z]{2,}$/i.test(text)) domains.add(text);
    });

    return Array.from(domains);
  }

  // ---------------- FTP ----------------
  async getFtpInfo() {
    this._checkLogin();
    const res = await this._request("GET", "/panel/indexpl.php?option=ftpsettings");
    const $ = cheerio.load(res.data);

    const ftp = { user: this.username, password: this.panelPassword, host: "", port: 21 };
    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 4) {
        const label = $(tds[0]).text().trim();
        const value = $(tds[1]).text().trim();
        if (label.includes("FTP Host Name")) ftp.host = value;
        if (label.includes("FTP Port")) ftp.port = parseInt(value, 10);
      }
    });
    return ftp;
  }

  // ---------------- SOFTACULOUS ----------------
  async getSoftaculousLink() {
    this._checkLogin();
    const res = await this._request(
      "GET",
      `/panel/indexpl.php?option=installer&ttt=0`,
      null,
      { maxRedirects: 0 }
    );

    const softaculousUrl =
      res.headers.location ||
      res.headers.Location ||
      `${this.panelUrl}/panel/softaculous/index.php`;

    return softaculousUrl;
  }

  // ---------------- USER STATS ----------------
  async getUserStats(option = "") {
    this._checkLogin();
    const res = await this._request("GET", "/panel/indexpl.php");
    const $ = cheerio.load(res.data);

    const stats = {};
    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 2) {
        const label = $(tds[0]).text().trim();
        let value = $(tds[1]).text().trim();

        if (label.includes("MySQL Databases")) value = value.replace(/:$/, "");
        if (label.includes("Parked Domains")) value = value.replace(/:$/, "");
        if (label.includes("Bandwidth used")) value = value.replace(/\n.*MB/i, "MB");

        if (label) stats[label] = value;
      }
    });

    if (!option) return stats;
    return stats[option] || null;
  }

  // ---------------- UNIFIED PANEL INFO ----------------
  async getPanelInfo() {
    this._checkLogin();
    const [databases, domains, ftp, softaculous, stats] = await Promise.all([
      this.listDatabases(),
      this.listDomains(),
      this.getFtpInfo(),
      this.getSoftaculousLink(),
      this.getUserStats(),
    ]);

    return {
      username: this.username,
      databases,
      domains,
      ftp,
      softaculous,
      stats,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------- LOGOUT ----------------
  async logout() {
    this._checkLogin();
    await this._request("GET", "/panel/indexpl.php?option=signout");
    this.loggedIn = false;
    this.sessionCookies = {};
    this.username = "";
    this.panelPassword = "";
    return true;
  }
}

module.exports = VistaPanelAPI;
