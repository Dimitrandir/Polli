import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staff", "0002_specialist_photo"),
    ]

    operations = [
        migrations.AddField(
            model_name="specialist",
            name="color",
            field=models.CharField(
                blank=True,
                help_text="Цвят на колоната и часовете в календара на персонала, напр. #7cb342. Празно = автоматично.",
                max_length=7,
                validators=[
                    django.core.validators.RegexValidator(
                        "^#[0-9a-fA-F]{6}$", "Цветът трябва да е във вида #1e88e5."
                    )
                ],
                verbose_name="цвят в календара",
            ),
        ),
    ]
