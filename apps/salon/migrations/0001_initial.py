import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="SalonInfo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=150, verbose_name="име")),
                ("legal_name", models.CharField(blank=True, max_length=200, verbose_name="юридическо лице")),
                ("phone", models.CharField(max_length=50, verbose_name="телефон")),
                ("email", models.EmailField(blank=True, max_length=254, verbose_name="имейл")),
                ("address", models.CharField(max_length=255, verbose_name="адрес")),
                ("facebook", models.URLField(blank=True, verbose_name="Facebook")),
                ("instagram", models.URLField(blank=True, verbose_name="Instagram")),
                ("tiktok", models.URLField(blank=True, verbose_name="TikTok")),
                ("booking_policy", models.TextField(blank=True, verbose_name="условия при резервация")),
            ],
            options={
                "verbose_name": "информация за салона",
                "verbose_name_plural": "информация за салона",
            },
        ),
        migrations.CreateModel(
            name="OpeningHours",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "weekday",
                    models.PositiveSmallIntegerField(
                        choices=[
                            (0, "понеделник"),
                            (1, "вторник"),
                            (2, "сряда"),
                            (3, "четвъртък"),
                            (4, "петък"),
                            (5, "събота"),
                            (6, "неделя"),
                        ],
                        verbose_name="ден",
                    ),
                ),
                ("start_time", models.TimeField(verbose_name="от")),
                ("end_time", models.TimeField(verbose_name="до")),
                (
                    "salon",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="opening_hours",
                        to="salon.saloninfo",
                        verbose_name="салон",
                    ),
                ),
            ],
            options={
                "verbose_name": "работно време",
                "verbose_name_plural": "работно време на салона",
                "ordering": ["weekday", "start_time"],
            },
        ),
    ]
