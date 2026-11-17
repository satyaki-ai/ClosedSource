import os
from openai import OpenAI

# Key is read from the OLLAMA_API_KEY env var (stored in .env, not hard-coded here).
client = OpenAI(
    base_url="https://ollama.com/v1",
    api_key=os.environ["OLLAMA_API_KEY"],
)

completion = client.chat.completions.create(
    model="deepseek-v4.1-flash",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(completion.choices[0].message.content)
