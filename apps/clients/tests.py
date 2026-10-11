from django.test import SimpleTestCase

from .phone import normalize_phone


class NormalizePhoneTests(SimpleTestCase):
    def test_bulgarian_formats(self):
        for raw in ["0888 123 456", "0888-123-456", "+359 888 123 456", "00359888123456", "359888123456"]:
            self.assertEqual(normalize_phone(raw), "+359888123456", raw)

    def test_foreign_number_keeps_country_code(self):
        self.assertEqual(normalize_phone("+44 20 7946 0958"), "+442079460958")

    def test_empty(self):
        self.assertEqual(normalize_phone(""), "")
