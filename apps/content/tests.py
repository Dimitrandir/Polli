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
        self.assertEqual(self.counts(), [2, 9, 59, 3, 93, 31, 3, 1])

        poli = Specialist.objects.get(name="Павлинка Ботева")
        self.assertEqual(poli.title, "Колорист, трихолог")
        self.assertTrue(poli.photo.name.startswith("specialists/"))
        self.assertEqual(poli.working_hours.count(), 6)

        cut = Service.objects.get(name="Дамско подстригване + сешоар")
        self.assertEqual(cut.price, Decimal("40.00"))
        self.assertEqual(cut.duration_minutes, 60)
        prices = {ss.specialist.name: ss.price for ss in cut.specialist_services.all()}
        self.assertEqual(prices, {"Павлинка Ботева": Decimal("40.00"), "Радослав Матев": Decimal("40.00")})
        long_colour = Service.objects.get(name="Боядисване с амонячна боя", option="на дълга коса")
        self.assertEqual(long_colour.display_name, "Боядисване с амонячна боя - на дълга коса")
        self.assertEqual(Service.objects.filter(name="Боядисване с амонячна боя").count(), 3)
        # Studio24 only gave a starting price for these, so the salon books them for now.
        self.assertFalse(Service.objects.get(name="Оформяне с маша").is_online_bookable)

        salon = SalonInfo.load()
        self.assertEqual(salon.phone, "+359 896 034 640")
        self.assertEqual([h.weekday for h in salon.opening_hours.all()], [0, 1, 2, 3, 4, 5])

    def test_running_again_keeps_admin_changes(self):
        self.run_import()
        Service.objects.filter(name="Мъжко подстригване").update(price=Decimal("25.00"))
        self.run_import()
        self.assertEqual(self.counts(), [2, 9, 59, 3, 93, 31, 3, 1])
        self.assertEqual(Service.objects.get(name="Мъжко подстригване").price, Decimal("25.00"))

        self.run_import("--overwrite")
        self.assertEqual(self.counts(), [2, 9, 59, 3, 93, 31, 3, 1])
        self.assertEqual(Service.objects.get(name="Мъжко подстригване").price, Decimal("20.00"))
        self.assertEqual(SalonInfo.load().opening_hours.count(), 6)

    def test_overwrite_hides_services_that_are_no_longer_offered(self):
        self.run_import()
        old = Service.objects.create(
            group=ServiceGroup.objects.get(name="Терапии за коса"), name="Стара терапия", price=10, duration_minutes=30
        )
        old_group = ServiceGroup.objects.create(category=ServiceCategory.objects.get(slug="kosa"), name="Стара група")
        self.run_import()
        old.refresh_from_db()
        self.assertTrue(old.is_active)

        self.run_import("--overwrite")
        old.refresh_from_db()
        old_group.refresh_from_db()
        self.assertFalse(old.is_active)
        self.assertFalse(old_group.is_active)
        self.assertTrue(Service.objects.get(name="Мъжко подстригване").is_active)

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
