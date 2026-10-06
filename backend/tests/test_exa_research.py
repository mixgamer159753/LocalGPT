import json
import unittest
from unittest.mock import patch

import httpx

from app.services import web_research as research


class ExaResearchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        settings = patch.multiple(
            research, WEB_SEARCH_ENABLED=True, WEB_SEARCH_PROVIDER="exa",
            EXA_API_KEY="fake-test-key", WEB_SEARCH_MAX_RESULTS=6,
            WEB_SEARCH_MAX_PAGES=3,
        )
        settings.start()
        self.addCleanup(settings.stop)
        research._research_cache.clear()
        self.addCleanup(research._research_cache.clear)
        self.messages = [{"role": "user", "content": "latest battery news"}]

    async def test_request_and_source_mapping(self):
        requests = []

        def handler(request):
            requests.append(request)
            self.assertEqual(str(request.url), "https://api.exa.ai/search")
            self.assertEqual(request.headers["x-api-key"], "fake-test-key")
            self.assertEqual(json.loads(request.content), {
                "query": "latest battery news", "contents": {"highlights": True},
            })
            return httpx.Response(200, json={"results": [
                {"title": "Battery research", "url": "https://example.com/news",
                 "highlights": ["New findings.", "Published today."]},
                {"url": "https://example.com/news", "highlights": ["Duplicate"]},
                {"url": "javascript:alert(1)", "highlights": ["Unsafe URL"]},
                {"url": "https://example.com/empty", "highlights": []},
                None,
            ]})

        client_factory = httpx.AsyncClient
        with patch.object(research.httpx, "AsyncClient", side_effect=lambda **kw:
                          client_factory(transport=httpx.MockTransport(handler), **kw)):
            bundle = await research.research_for_messages(self.messages)
            cached = await research.research_for_messages(self.messages)
        self.assertEqual(len(requests), 1)
        self.assertIs(cached, bundle)
        self.assertEqual(len(bundle.sources), 1)
        self.assertIn("Published today", bundle.sources[0].text)
        context = research.apply_research_context(self.messages, bundle)[0]["content"]
        self.assertIn("[1] Battery research", context)
        self.assertIn("https://example.com/news", context)
        self.assertIn("untrusted reference material", context)

    async def test_missing_key_does_not_send_request(self):
        with patch.object(research, "EXA_API_KEY", ""), patch.object(research.httpx, "AsyncClient") as client:
            bundle = await research.research_for_messages(self.messages)
        client.assert_not_called()
        self.assertIn("EXA_API_KEY", bundle.warning)
        self.assertFalse(research._research_cache)

    async def test_failures_are_not_cached_and_do_not_expose_response(self):
        for status in (401, 429, 500):
            with self.subTest(status=status):
                client_factory = httpx.AsyncClient
                transport = httpx.MockTransport(lambda req: httpx.Response(status, text="fake-test-key"))
                with patch.object(research.httpx, "AsyncClient", side_effect=lambda **kw:
                                  client_factory(transport=transport, **kw)):
                    bundle = await research.research_for_messages(self.messages)
                self.assertFalse(bundle.sources)
                self.assertNotIn("fake-test-key", bundle.warning)
                self.assertFalse(research._research_cache)
                self.assertIn("could not be verified", research._format_research_context(bundle))

    async def test_malformed_payload_and_empty_results(self):
        for payload in ([], {"results": None}, {"results": []}):
            client_factory = httpx.AsyncClient
            transport = httpx.MockTransport(lambda req: httpx.Response(200, json=payload))
            with patch.object(research.httpx, "AsyncClient", side_effect=lambda **kw:
                              client_factory(transport=transport, **kw)):
                bundle = await research.research_for_messages(self.messages)
            self.assertFalse(bundle.sources)
            self.assertIsNotNone(bundle.warning)
            self.assertFalse(research._research_cache)

    async def test_disabled_search_does_not_send_request(self):
        with patch.object(research, "WEB_SEARCH_ENABLED", False), patch.object(research.httpx, "AsyncClient") as client:
            self.assertIsNone(await research.research_for_messages(self.messages))
        client.assert_not_called()
