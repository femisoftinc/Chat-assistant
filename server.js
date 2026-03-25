const http = require('http');
const handler = require('./api/chat.js'); // Ensure path is correct

const server = http.createServer(async (req, res) => {
  // Add these CORS headers at the very top of the request handler
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle the "Preflight" request
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body);
        
        // Mocking the Vercel 'res' object for your handler
        const mockRes = {
          status: (code) => ({
            json: (data) => {
              res.writeHead(code, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            }
          })
        };

        await handler(req, mockRes);
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }
});

server.listen(3000, () => console.log('Server running at http://localhost:3000'));