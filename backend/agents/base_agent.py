import ssl
import certifi
import urllib.request
import urllib.error
import json
import os
import socket
from openai import OpenAI
from core.config import settings


class BaseAgent:
    """
    Every Benela AI agent inherits from this.
    Calls Anthropic Claude API with real database context injected.
    """

    def __init__(self, name: str, system_prompt: str):
        self.name              = name
        self.system_prompt     = system_prompt
        self.anthropic_api_key = settings.ANTHROPIC_API_KEY
        self.openai_api_key    = settings.OPENAI_API_KEY
        self.anthropic_api_url = "https://api.anthropic.com/v1/messages"
        self.default_model     = "claude-haiku-4-5-20251001"
        self.default_openai_model = "gpt-4.1-mini"
        self.provider_timeout_seconds = float(os.getenv("AI_PROVIDER_TIMEOUT_SECONDS", "20"))
        self.allowed_models = {
            "claude-haiku-4-5-20251001",
            "claude-sonnet-4-5-20250929",
            "claude-opus-4-1-20250805",
        }
        self.allowed_openai_models = {
            "gpt-4.1-mini",
            "gpt-4.1",
            "gpt-4o-mini",
            "gpt-4o",
        }

    def _resolve_provider(self, requested_provider: str | None) -> str:
        if requested_provider and requested_provider.strip().lower() == "openai":
            return "openai"
        return "anthropic"

    def _resolve_model(self, requested_model: str | None, provider: str) -> str:
        if provider == "openai":
            if not requested_model:
                return self.default_openai_model
            normalized = requested_model.strip()
            if normalized in self.allowed_openai_models or normalized.startswith("gpt-"):
                return normalized
            return self.default_openai_model

        if not requested_model:
            return self.default_model
        normalized = requested_model.strip()
        if normalized in self.allowed_models:
            return normalized
        return self.default_model

    def run(
        self,
        user_message: str,
        context: str = "",
        model: str | None = None,
        provider: str | None = None,
        temperature: float | None = None,
        extra_system_instructions: str | None = None,
        user_blocks: list[dict] | None = None,
    ) -> str:
        """Send a message to Claude with optional real data context."""

        provider_name = self._resolve_provider(provider)
        base_system = self.system_prompt
        if extra_system_instructions and extra_system_instructions.strip():
            base_system = f"{base_system}\n\nADDITIONAL SECTION-SPECIFIC INSTRUCTIONS:\n{extra_system_instructions.strip()}"

        if context:
            full_system = (
                f"{base_system}\n\n"
                f"You have access to the following REAL, LIVE data from the "
                f"Benela AI database. Use this data to answer the user's question "
                f"accurately and specifically. Never say you lack real-time access.\n\n"
                f"{context}"
            )
        else:
            full_system = base_system

        content_blocks: list[dict] = []
        if user_message.strip():
            content_blocks.append({"type": "text", "text": user_message})
        if user_blocks:
            content_blocks.extend(user_blocks)

        selected_model = self._resolve_model(model, provider_name)

        if provider_name == "openai":
            if not self.openai_api_key:
                raise Exception("OpenAI API key is not configured.")
            client = OpenAI(
                api_key=self.openai_api_key,
                timeout=self.provider_timeout_seconds,
                max_retries=1,
            )
            user_text = user_message.strip()
            if not user_text:
                user_text = "Use the available context and provide a concise answer."
            completion = client.chat.completions.create(
                model=selected_model,
                max_tokens=1024,
                temperature=temperature if temperature is not None else 0.2,
                messages=[
                    {"role": "system", "content": full_system},
                    {"role": "user", "content": user_text},
                ],
            )
            return (completion.choices[0].message.content or "").strip()

        if not self.anthropic_api_key:
            raise Exception("Anthropic API key is not configured.")

        payload = {
            "model":      selected_model,
            "max_tokens": 1024,
            "system":     full_system,
            "messages": [
                {"role": "user", "content": content_blocks}
            ]
        }

        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            self.anthropic_api_url,
            data=data,
            headers={
                "Content-Type":      "application/json",
                "x-api-key":         self.anthropic_api_key,
                "anthropic-version": "2023-06-01"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(
                req,
                context=ssl.create_default_context(cafile=certifi.where()),
                timeout=self.provider_timeout_seconds,
            ) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result["content"][0]["text"]

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise Exception(f"Claude API error {e.code}: {error_body}")
        except urllib.error.URLError as e:
            raise Exception(f"Claude API connection error: {e.reason}")
        except socket.timeout:
            raise Exception("Claude API request timed out.")
