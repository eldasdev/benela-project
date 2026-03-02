import ssl
import certifi
import urllib.request
import urllib.error
import json
from core.config import settings


class BaseAgent:
    """
    Every Benela AI agent inherits from this.
    Calls Anthropic Claude API directly — no heavy dependencies needed.
    """

    def __init__(self, name: str, system_prompt: str):
        self.name = name
        self.system_prompt = system_prompt
        self.api_key = settings.ANTHROPIC_API_KEY
        self.api_url = "https://api.anthropic.com/v1/messages"

    def run(self, user_message: str) -> str:
        """Send a message to Claude and get a response."""

        payload = {
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1024,
            "system": self.system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_message
                }
            ]
        }

        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            self.api_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(
                req,
                context=ssl.create_default_context(cafile=certifi.where())
            ) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result["content"][0]["text"]

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise Exception(f"Claude API error {e.code}: {error_body}")
