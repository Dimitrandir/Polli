import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clients", "0001_initial"),
        ("staff", "0003_specialist_color"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="nickname",
            field=models.CharField(
                blank=True,
                help_text="Вижда се само от салона. Търсенето на клиент намира и по него (напр. „Митко“).",
                max_length=100,
                verbose_name="псевдоним",
            ),
        ),
        migrations.AddField(
            model_name="client",
            name="privacy_consent_version",
            field=models.CharField(blank=True, max_length=20, verbose_name="версия на политиката"),
        ),
        migrations.AddField(
            model_name="client",
            name="marketing_consent_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="съгласие за промоции"),
        ),
        migrations.AddField(
            model_name="client",
            name="preferred_specialist",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="staff.specialist",
                verbose_name="любим специалист",
            ),
        ),
        migrations.AddField(
            model_name="client",
            name="reminder_channel",
            field=models.CharField(
                choices=[("email", "имейл"), ("none", "без напомняния")],
                default="email",
                max_length=10,
                verbose_name="напомняния",
            ),
        ),
        migrations.CreateModel(
            name="ClientNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.TextField(verbose_name="бележка")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="създадена")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="променена")),
                (
                    "author",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="автор",
                    ),
                ),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="private_notes",
                        to="clients.client",
                        verbose_name="клиент",
                    ),
                ),
            ],
            options={
                "verbose_name": "лична бележка",
                "verbose_name_plural": "лични бележки",
                "ordering": ["-updated_at"],
            },
        ),
        migrations.CreateModel(
            name="Message",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("from_client", models.BooleanField(default=False, verbose_name="от клиента")),
                ("text", models.TextField(verbose_name="текст")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="изпратено")),
                (
                    "read_at",
                    models.DateTimeField(
                        blank=True, help_text="Кога го е видяла другата страна.", null=True, verbose_name="прочетено"
                    ),
                ),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="clients.client",
                        verbose_name="клиент",
                    ),
                ),
                (
                    "sender",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="изпратено от",
                    ),
                ),
            ],
            options={
                "verbose_name": "съобщение",
                "verbose_name_plural": "съобщения",
                "ordering": ["created_at", "pk"],
                "indexes": [models.Index(fields=["client", "created_at"], name="clients_mes_client__5c38a3_idx")],
            },
        ),
    ]
