const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiClient = new GoogleGenerativeAI({
  apiKey: process.env.GEMINI_KEY
});

module.exports = aiClient;
