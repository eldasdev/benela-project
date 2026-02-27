import ssl
import certifi
import urllib.request
import urllib.error
import json
from core.config import settings


class BaseAgent:
    """
    Every Benela AI agent inherits from this.
    Calls Gemini REST API directly — no heavy dependencies needed.
    """

    def __init__(self, name: str, system_prompt: str):
        self.name = name
        self.system_prompt = system_prompt
        self.api_key = settings.GEMINI_API_KEY
        self.api_url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash-lite:generateContent"
        )

    def run(self, user_message: str) -> str:
        """Send a message to Gemini and get a response."""

        # Build the request body
        payload = {
            "system_instruction": {
                "parts": [{"text": self.system_prompt}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_message}]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 1024,
            }
        }

        # Encode payload
        data = json.dumps(payload).encode("utf-8")

        # Build request
        url = f"{self.api_url}?key={self.api_key}"
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        # Send request
        try:
            with urllib.request.urlopen(req, context=ssl.create_default_context(cafile=certifi.where())) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result["candidates"][0]["content"]["parts"][0]["text"]

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise Exception(f"Gemini API error {e.code}: {error_body}")