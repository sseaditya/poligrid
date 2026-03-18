const fs = require('fs');
const http = require('http');

async function testApi() {
  const apiKey = fs.readFileSync('.env.local', 'utf8').match(/OPENAI_API_KEY=(.*)/)[1];
  const payload = {
    model: "gpt-5.4",
    reasoning: { effort: "low" },
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Say hello and return a json like {\"hello\": \"world\"}" }]
      }
    ],
    max_output_tokens: 200
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  console.log("STATUS:", response.status);
  console.log("RAW JSON:", JSON.stringify(JSON.parse(raw), null, 2));
}

testApi().catch(console.error);
