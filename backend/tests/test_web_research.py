import unittest

from app.services.web_research import (
    ReadableHtmlParser,
    ResearchBundle,
    ResearchSource,
    SearchDecision,
    apply_research_context,
    decide_search,
    _format_research_context,
)


class WebResearchTests(unittest.TestCase):
    def test_does_not_search_date_only_query(self):
        decision = decide_search([{"role": "user", "content": "What is the date today?"}])

        self.assertIsNone(decision)

    def test_searches_with_always_mode(self):
        decision = decide_search([{"role": "user", "content": "What are the latest developments in AI?"}])

        self.assertIsNotNone(decision)
        self.assertTrue(decision.needs_search)

    def test_searches_current_weather(self):
        decision = decide_search([{"role": "user", "content": "What is the weather today in Tunis?"}])

        self.assertIsNotNone(decision)
        self.assertTrue(decision.needs_search)

    def test_searches_product_comparison(self):
        decision = decide_search([{"role": "user", "content": "Find the best RTX 4060 under $300"}])

        self.assertTrue(decision.needs_search)
        self.assertEqual(decision.status, "Comparing sources...")

    def test_searches_documentation_questions(self):
        decision = decide_search([{"role": "user", "content": "What is the latest Next.js documentation for caching?"}])

        self.assertTrue(decision.needs_search)
        self.assertEqual(decision.status, "Reading documentation...")

    def test_searches_photo_requests(self):
        decision = decide_search([{"role": "user", "content": "Show me photos of the BMW M4"}])

        self.assertTrue(decision.needs_search)

    def test_applies_research_to_last_user_message_only(self):
        messages = [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
            {"role": "user", "content": "latest price?"},
        ]
        research = ResearchBundle(
            decision=SearchDecision(True, "latest price?", "Searching the web..."),
            sources=[
                ResearchSource(
                    title="Example",
                    url="https://example.com",
                    snippet="Snippet",
                    text="Important current fact",
                )
            ],
        )

        enriched = apply_research_context(messages, research)

        self.assertEqual(enriched[0]["content"], "hello")
        self.assertEqual(enriched[1]["content"], "hi")
        self.assertIn("Important current fact", enriched[2]["content"])
        self.assertIn("https://example.com", enriched[2]["content"])

    def test_research_context_includes_source_images(self):
        research = ResearchBundle(
            decision=SearchDecision(True, "latest camera", "Searching the web..."),
            sources=[
                ResearchSource(
                    title="Camera Review",
                    url="https://example.com/camera",
                    snippet="Snippet",
                    text="A reviewed camera.",
                    image_url="https://example.com/camera.jpg",
                )
            ],
        )

        context = _format_research_context(research)

        self.assertIn("Useful source images", context)
        self.assertIn("https://example.com/camera.jpg", context)

    def test_readable_parser_extracts_social_preview_image(self):
        parser = ReadableHtmlParser()
        parser.feed(
            """
            <html>
              <head>
                <title>Example Product</title>
                <meta property="og:image" content="/product.jpg">
              </head>
              <body><h1>Example Product</h1><p>Fast and quiet.</p></body>
            </html>
            """
        )

        self.assertEqual(parser.title, "Example Product")
        self.assertEqual(parser.image_url, "/product.jpg")
        self.assertIn("Fast and quiet", parser.text)

    def test_readable_parser_uses_content_image_fallback(self):
        parser = ReadableHtmlParser()
        parser.feed(
            """
            <html>
              <body>
                <img src="/logo.svg" alt="logo">
                <img src="/car-photo.webp" alt="BMW M4 parked outside">
                <p>Sports coupe.</p>
              </body>
            </html>
            """
        )

        self.assertEqual(parser.fallback_image_url, "/car-photo.webp")


if __name__ == "__main__":
    unittest.main()
