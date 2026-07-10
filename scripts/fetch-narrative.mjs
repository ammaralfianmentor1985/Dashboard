// Narrative + sentiment content, researched live via Claude + web search.
// Balanced by design: report what's actually happening (good or bad) in each market,
// with real, verifiable citations. No invented figures — if uncertain, the model must say so.

// Explicit per-section schema (kept flat for reliability with tool-forced output)
function sectionSchema(label) {
  return {
    type: 'object',
    required: ['badge', 'points'],
    properties: {
      badge: { type: 'string', description: 'short sentiment badge e.g. Positif, Waspada, Negatif' },
      points: {
        type: 'array',
        items: {
          type: 'object',
          required: ['text', 'source'],
          properties: {
            text: { type: 'string' },
            source: { type: 'string', description: 'publication + date, e.g. "Reuters, 9 Jun 2026"' },
          },
        },
      },
    },
  };
}

const FULL_SCHEMA = {
  type: 'object',
  required: ['sentimentScore', 'sentimentLabel', 'usStocks', 'forex', 'crypto', 'commodities', 'indonesia', 'malaysia', 'opportunities', 'summary'],
  properties: {
    sentimentScore: { type: 'number' },
    sentimentLabel: { type: 'string' },
    usStocks: sectionSchema('US Stocks'),
    forex: sectionSchema('Forex'),
    crypto: sectionSchema('Crypto'),
    commodities: sectionSchema('Commodities'),
    indonesia: sectionSchema('Indonesia'),
    malaysia: sectionSchema('Malaysia'),
    opportunities: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        required: ['market', 'icon', 'text', 'source'],
        properties: {
          market: { type: 'string' },
          icon: { type: 'string' },
          text: { type: 'string' },
          source: { type: 'string' },
        },
      },
    },
    summary: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
};

export async function fetchNarrative({ apiKey, dateLabel }) {
  const prompt = `You are researching today's (${dateLabel}) real global market news for an institutional-style daily briefing.

Use web search to find CURRENT, REAL news for each section. Report what is ACTUALLY happening — do not force positive-only or negative-only framing. If a market had bad news, report the bad news; if Indonesia/Malaysia had good news, report it too. Every point MUST cite a real source (publication + date). If you cannot verify something, omit it rather than guessing.

Sections needed:
- usStocks: US equity market (indices, notable earnings/sector moves)
- forex: major currency pairs, central bank drivers
- crypto: Bitcoin/Ethereum and institutional flows
- commodities: gold, oil, silver — geopolitical/macro drivers
- indonesia: Indonesian economy — IHSG, rupiah, capital flows, BI policy, real risks/positives
- malaysia: Malaysian economy — FBM KLCI, ringgit, BNM policy, real risks/positives
- opportunities: up to 4 strongest, most credible near-term opportunities across any market today, each grounded in a real cited driver — presented persuasively but honestly, no invented price targets not attributable to a real source
- summary: 3-5 short executive takeaways

Return via the market_briefing tool only.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      tools: [
        { type: 'web_search_20250305', name: 'web_search' },
        { name: 'market_briefing', description: 'Submit the structured briefing', input_schema: FULL_SCHEMA },
      ],
      tool_choice: { type: 'tool', name: 'market_briefing' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const toolUse = data.content?.find((c) => c.type === 'tool_use' && c.name === 'market_briefing');
  if (!toolUse) throw new Error('Model did not return structured market_briefing output');
  return toolUse.input;
}
