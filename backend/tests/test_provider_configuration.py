import os
from pathlib import Path
import runpy
import unittest
from unittest.mock import Mock, patch

from dotenv import dotenv_values
import requests

from app.services.ollama import OllamaService, OllamaUnavailableError


BACKEND_DIR = Path(__file__).resolve().parents[1]
MODEL_ID = "mradermacher/DeepSeek-V4-Pro-Qwen3_5-4B_Q8_0"


def isolated_config(**environment):
    # Verify a fresh checkout without reading the developer's private .env.
    with patch.dict(os.environ, environment, clear=True), patch("dotenv.load_dotenv"):
        return runpy.run_path(str(BACKEND_DIR / "app/core/config.py"))


class ProviderConfigurationTests(unittest.TestCase):
    def test_fresh_checkout_targets_atomic_chat(self):
        config = isolated_config()
        self.assertFalse(config["LLM_USE_NATIVE_OLLAMA"])
        self.assertEqual(config["OLLAMA_HOST"], "http://127.0.0.1:1337")
        self.assertEqual(config["OLLAMA_CHAT_URL"], "http://127.0.0.1:1337/v1/chat/completions")
        self.assertEqual(config["OLLAMA_TAGS_URL"], "http://127.0.0.1:1337/v1/models")
        self.assertEqual(config["DEFAULT_MODEL"], "")

    def test_example_file_uses_the_same_provider_defaults(self):
        example = dotenv_values(BACKEND_DIR / ".env.example")
        config = isolated_config(**{key: value for key, value in example.items() if value is not None})
        defaults = isolated_config()
        for key in ("LLM_USE_NATIVE_OLLAMA", "OLLAMA_HOST", "OLLAMA_CHAT_URL", "OLLAMA_TAGS_URL", "CORS_ORIGINS"):
            with self.subTest(setting=key):
                self.assertEqual(config[key], defaults[key])

    def test_explicit_native_provider_configuration_remains_supported(self):
        config = isolated_config(LLM_USE_NATIVE_OLLAMA="true", OLLAMA_HOST="http://127.0.0.1:11434")
        self.assertTrue(config["LLM_USE_NATIVE_OLLAMA"])
        self.assertEqual(config["OLLAMA_CHAT_URL"], "http://127.0.0.1:11434/api/chat")
        self.assertEqual(config["OLLAMA_TAGS_URL"], "http://127.0.0.1:11434/api/tags")

    def test_available_model_selection_preserves_full_atomic_id(self):
        with patch("app.services.ollama.LLM_USE_NATIVE_OLLAMA", False):
            provider = OllamaService()
            with patch.object(provider, "list_models", return_value=[{"id": MODEL_ID}]):
                self.assertEqual(provider.resolve_model(MODEL_ID), MODEL_ID)
                self.assertEqual(provider.resolve_model("unavailable-model"), MODEL_ID)

    def test_chat_posts_the_full_id_to_atomic_completions(self):
        response = Mock()
        response.json.return_value = {"choices": [{"message": {"content": "Hello"}}]}
        endpoint = "http://127.0.0.1:1337/v1/chat/completions"
        with patch.multiple("app.services.ollama", LLM_USE_NATIVE_OLLAMA=False, OLLAMA_CHAT_URL=endpoint), \
                patch("app.services.ollama_payload.LLM_USE_NATIVE_OLLAMA", False), \
                patch("app.services.ollama.requests.post", return_value=response) as post:
            answer = OllamaService().chat(
                [{"role": "user", "content": "Hi"}], model=MODEL_ID, max_tokens=16384,
            )

        self.assertEqual(answer, "Hello")
        self.assertEqual(post.call_args.args[0], endpoint)
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["model"], MODEL_ID)
        self.assertEqual(payload["max_tokens"], 16384)
        self.assertNotIn("options", payload)

    def test_unavailable_atomic_server_reports_model_server_error(self):
        with patch("app.services.ollama.requests.get", side_effect=requests.exceptions.ConnectionError):
            with self.assertRaisesRegex(OllamaUnavailableError, "model server"):
                OllamaService().list_models()


if __name__ == "__main__":
    unittest.main()
