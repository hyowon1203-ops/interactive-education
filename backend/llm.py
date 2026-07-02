"""OpenAI API client with JSON response parsing."""

import json
import os

from openai import AsyncOpenAI

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


async def call_llm(
    system: str,
    user: str,
    model: str = "gpt-4o-mini",
    max_tokens: int = 4096,
) -> dict:
    client = _get_client()
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    return parse_json_response(response.choices[0].message.content)


def parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        inner: list[str] = []
        for i, line in enumerate(lines):
            if i == 0:
                continue
            if line.strip() == "```":
                break
            inner.append(line)
        text = "\n".join(inner)
    return json.loads(text)
