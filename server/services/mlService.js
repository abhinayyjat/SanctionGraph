/**
 * server/services/mlService.js — Week 4
 * Adds generateReport() using OpenAI GPT-4o.
 */
const axios = require('axios')
const ml = axios.create({
  baseURL: process.env.ML_SERVICE_URL || 'http://ml-service:8000',
  headers: { 'Content-Type': 'application/json' },
})

exports.buildGraph = async (entityName, maxHops = 3) => {
  const { data } = await ml.post('/graph/build', { entity_name: entityName, max_hops: maxHops }, { timeout: 90_000 })
  return data.graph
}

exports.resolveEntity = async (name) => {
  const { data } = await ml.post('/resolve', { name }, { timeout: 30_000 })
  return data
}

exports.checkSanctions = async (name) => {
  const { data } = await ml.post('/sanctions/check', { name }, { timeout: 30_000 })
  return data
}

exports.searchIcij = async (query) => {
  const { data } = await ml.get('/icij/search', { params: { q: query }, timeout: 10_000 })
  return data
}

// NEW Week 4 — generates compliance narrative from graph data via OpenAI
exports.generateReport = async (graphData, seedName) => {
  const Groq = require('groq-sdk')
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const nodes  = graphData.nodes || []
  const sanctioned  = nodes.filter(n => n.data?.sanctioned).map(n => n.data?.name)
  const highRisk    = nodes.filter(n => (n.data?.risk_score||0) >= 70).map(n => n.data?.name)
  const overallRisk = nodes.length
    ? Math.round(nodes.reduce((s,n) => s + (n.data?.risk_score||0), 0) / nodes.length)
    : 0
  const jurisdictions = [...new Set(nodes.map(n => n.data?.jurisdiction).filter(Boolean))]

  const res = await groq.chat.completions.create({
    model: 'llama3-8b-8192',   // or 'llama3-70b-8192' for better quality
    messages: [{
      role: 'user',
      content: `Write a formal compliance risk assessment.
Subject: ${seedName}
Graph: ${nodes.length} entities across ${jurisdictions.join(', ')||'unknown'} jurisdictions
Overall risk: ${overallRisk}/100
Directly sanctioned: ${sanctioned.join(', ')||'None'}
High-risk entities (>=70): ${highRisk.join(', ')||'None'}

Structure:
1. Executive Summary
2. Risk Findings
3. Jurisdiction Analysis
4. Recommended Actions
5. Disclaimer

Tone: professional compliance analyst. Factual, no speculation.`
    }],
    max_tokens: 900,
    temperature: 0.3,
  })

  return res.choices[0].message.content
}