const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const stream = true;

const headers = {
  "Authorization": "Bearer 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",
  "Accept": stream ? "text/event-stream" : "application/json",
  "Content-Type": "application/json"
};

const payload = {
  "model": "moonshotai/kimi-k2.5",
  "messages": [{"role":"user","content":"Hello"}],
  "max_tokens": 16384,
  "temperature": 1.00,
  "top_p": 1.00,
  "stream": stream,
  "chat_template_kwargs": {"thinking":true},
};

fetch(invokeUrl, {
  method: 'POST',
  headers: headers,
  body: JSON.stringify(payload)
})
.then(async response => {
  if (stream) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      console.log(decoder.decode(value));
    }
  } else {
    console.log(await response.json());
  }
})
.catch(error => {
  console.error(error);
});
