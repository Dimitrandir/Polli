from django.db import migrations, models

SEPARATOR = " — "


def split_options(apps, schema_editor):
    """Split "Кичури — на цялата коса" into name "Кичури" and option "на цялата коса"."""
    Service = apps.get_model("catalog", "Service")
    for service in Service.objects.filter(name__contains=SEPARATOR):
        name, option = service.name.split(SEPARATOR, 1)
        service.name, service.option = name.strip(), option.strip()
        service.save(update_fields=["name", "option"])


def join_options(apps, schema_editor):
    Service = apps.get_model("catalog", "Service")
    for service in Service.objects.exclude(option=""):
        service.name = f"{service.name}{SEPARATOR}{service.option}"
        service.save(update_fields=["name"])


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="service",
            name="option",
            field=models.CharField(
                blank=True,
                help_text="Вариант на услугата, напр. „на дълга коса“. Услугите с едно и също име в групата "
                "се показват като една услуга с избор на опция.",
                max_length=100,
                verbose_name="опция",
            ),
        ),
        migrations.RunPython(split_options, join_options),
    ]
