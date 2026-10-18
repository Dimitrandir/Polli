import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("bookings", "0002_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="created_by",
            field=models.ForeignKey(
                blank=True,
                help_text="Служителят, който е записал часа. Празно = клиентът онлайн.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
                verbose_name="записана от",
            ),
        ),
        migrations.CreateModel(
            name="BookingEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("at", models.DateTimeField(auto_now_add=True, verbose_name="кога")),
                ("who", models.CharField(max_length=150, verbose_name="кой")),
                ("text", models.CharField(max_length=255, verbose_name="какво")),
                (
                    "booking",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="events",
                        to="bookings.booking",
                        verbose_name="резервация",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="служител",
                    ),
                ),
            ],
            options={
                "verbose_name": "промяна",
                "verbose_name_plural": "история",
                "ordering": ["at", "pk"],
            },
        ),
    ]
