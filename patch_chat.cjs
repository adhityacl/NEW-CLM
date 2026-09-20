const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const chatRoute = `
// ============================================================================
// AI Chat Integration
// ============================================================================

app.post('/api/chat', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
       return res.status(500).json({ 
         error: 'GEMINI_API_KEY environment variable is missing. Please configure it to use AI features.' 
       });
    }

    // Prepare a structured JSON string of the current database
    const dbContext = {
      partners: db.partners.map(p => ({
        id: p.partner_id,
        name: p.nama_partner,
        status: p.status_kerjasama,
        category: p.kategori_partner
      })),
      contracts: db.contracts.map(c => ({
        id: c.contract_id,
        partner: c.partner_nama,
        status: c.status,
        value: c.nilai_kontrak,
        currency: c.currency,
        start_date: c.tanggal_mulai,
        end_date: c.tanggal_berakhir,
        days_remaining: c.sisa_hari
      })),
      ios: db.ios.map(i => ({
        id: i.io_id,
        partner: i.partner_nama,
        net_cost: i.net_cost_input,
        currency: i.currency,
        status: i.status
      })),
      spendings: db.spendings.map(s => ({
        id: s.spending_id,
        partner: s.partner_nama,
        amount: s.amount,
        currency: s.currency
      }))
    };

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = \`
    You are a helpful AI assistant integrated into a partnership and contract management dashboard.
    Your job is to answer the user's question based strictly on the provided JSON data representing the current state of the database.

    Current Database JSON:
    \${JSON.stringify(dbContext, null, 2)}

    User's Question:
    "\${query}"

    Guidelines:
    1. Be concise, direct, and polite.
    2. If the user asks for a count (e.g., "how many active partners"), count them accurately from the JSON.
    3. If the user asks for financial totals, sum them accurately based on the JSON. Note that currencies might differ.
    4. If the data to answer the question is not in the JSON, say that you don't have enough information to answer.
    5. Answer in Indonesian, as the app is in Indonesian.
    \`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            temperature: 0.2, // Low temp for factual data retrieval
        }
    });

    res.json({ 
      success: true, 
      reply: response.text 
    });

  } catch (error: any) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: error.message || 'Failed to process AI request' });
  }
});
`;

// Find API 404 Fallback
const targetIndex = code.indexOf('// API 404 Fallback:');
if (targetIndex !== -1) {
    code = code.slice(0, targetIndex) + chatRoute + '\n' + code.slice(targetIndex);
    fs.writeFileSync('server.ts', code);
    console.log("Patched successfully!");
} else {
    console.log("Could not find insertion point!");
}
