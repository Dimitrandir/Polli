from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("salon", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="saloninfo",
            name="max_days_ahead",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Колко дни напред клиентите могат да си запишат час онлайн.",
                null=True,
                verbose_name="записване до (дни напред)",
            ),
        ),
        migrations.AddField(
            model_name="saloninfo",
            name="min_notice_minutes",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Колко минути след момента е най-ранният час, който клиент може да запише онлайн.",
                null=True,
                verbose_name="най-рано след (мин.)",
            ),
        ),
        migrations.AddField(
            model_name="saloninfo",
            name="cancellation_hours",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="До колко часа преди началото клиентът може да откаже сам.",
                null=True,
                verbose_name="онлайн отказ до (часа преди)",
            ),
        ),
    ]
