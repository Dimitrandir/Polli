import shutil
import tempfile
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.catalog.models import Service, ServiceCategory, ServiceGroup
from apps.content.models import Article, Page
from apps.salon.models import SalonInfo
from apps.staff.models import Specialist, SpecialistService


class ImportSiteContentTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_root = tempfile.mkdtemp()
        cls.media = override_settings(MEDIA_ROOT=cls.media_root)
        cls.media.enable()

    @classmethod
    def tearDownClass(cls):
        cls.media.disable()
        shutil.rmtree(cls.media_root, ignore_errors=True)
        super().tearDownClass()

    def run_import(self, *args):
        call_command("import_site_content", *args, stdout=StringIO())

    def counts(self):
        return [
            m.objects.count()
            for m in [ServiceCategory, ServiceGroup, Service, Specialist, SpecialistService, Article, Page, SalonInfo]
        ]

    def test_loads_the_whole_site(self):
        self.run_import()
        self.assertEqual(self.counts(), [2, 9, 41, 3, 63, 31, 3, 1])

        poli = Specialist.objects.get(name="Павлинка Ботева")
        self.assertEqual(poli.title, "Колорист, трихолог")
        self.assertTrue(poli.photo.name.startswith("specialists/"))
        self.assertEqual(
            [(h.weekday, f"{h.start_time:%H:%M}", f"{h.end_time:%H:%M}") for h in poli.working_hours.all()],
            [(d, "09:00", "17:00") for d in range(5)],
        )
        radoslav = Specialist.objects.get(name="Радослав Матев")
        self.assertEqual([h.weekday for h in radoslav.working_hours.all()], [0, 1, 2, 3, 4, 5])

        cut = Service.objects.get(name="Дамско със сешоар")
        self.assertEqual(cut.price, Decimal("43.46"))
        self.assertEqual(cut.duration_minutes, 60)
        prices = {ss.specialist.name: ss.price for ss in cut.specialist_services.all()}
        self.assertEqual(prices, {"Павлинка Ботева": Decimal("43.97"), "Радослав Матев": Decimal("40.39")})

        salon = SalonInfo.load()
        self.assertEqual(salon.phone, "+359 896 034 640")
        self.assertEqual([h.weekday for h in salon.opening_hours.all()], [0, 1, 2, 3, 4, 5])

    def test_running_again_keeps_admin_changes(self):
        self.run_import()
        Service.objects.filter(name="Мъжко").update(price=Decimal("25.00"))
        Specialist.objects.get(name="Бела Тодорова").working_hours.filter(weekday=0).delete()
        self.run_import()
        self.assertEqual(self.counts(), [2, 9, 41, 3, 63, 31, 3, 1])
        self.assertEqual(Service.objects.get(name="Мъжко").price, Decimal("25.00"))
        self.assertEqual(Specialist.objects.get(name="Бела Тодорова").working_hours.count(), 4)

        self.run_import("--overwrite")
        self.assertEqual(self.counts(), [2, 9, 41, 3, 63, 31, 3, 1])
        self.assertEqual(Service.objects.get(name="Мъжко").price, Decimal("20.45"))
        self.assertEqual(SalonInfo.load().opening_hours.count(), 6)
        self.assertEqual(Specialist.objects.get(name="Бела Тодорова").working_hours.count(), 5)

    def test_api_serves_the_content(self):
        self.run_import()
        api = APIClient()

        salon = api.get(reverse("api:salon")).json()
        self.assertEqual(salon["address"], "София 1000, ж.к. Стрелбище, ул. Тулча 37")
        self.assertEqual(salon["opening_hours"][5], {"weekday": 5, "start_time": "10:00", "end_time": "17:00"})

        articles = api.get(reverse("api:article-list")).json()
        self.assertEqual(len(articles), 31)
        self.assertNotIn("body", articles[0])
        self.assertGreaterEqual(articles[0]["published_at"], articles[-1]["published_at"])

        slug = "8-ekspertni-nachina-za-zashtita-na-kosata-ot-presa-masha-seshoar"
        article = api.get(reverse("api:article-detail", args=[slug])).json()
        self.assertIn("## Какво е топлинно увреждане?", article["body"])
        tagged = api.get(reverse("api:article-list"), {"tag": "термозащита"}).json()
        self.assertIn(slug, [a["slug"] for a in tagged])

        page = api.get(reverse("api:page-detail", args=["obshti-usloviya"])).json()
        self.assertEqual(page["title"], "Общи условия")

        team = api.get(reverse("api:specialist-list")).json()
        self.assertEqual([s["name"] for s in team], ["Павлинка Ботева", "Радослав Матев", "Бела Тодорова"])
        self.assertIn("/media/specialists/", team[0]["photo"])

    def test_unpublished_article_is_hidden(self):
        self.run_import()
        Article.objects.update(is_published=False)
        self.assertEqual(APIClient().get(reverse("api:article-list")).json(), [])
