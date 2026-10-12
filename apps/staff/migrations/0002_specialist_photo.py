from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staff", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="specialist",
            name="photo",
            field=models.ImageField(blank=True, upload_to="specialists/", verbose_name="снимка"),
        ),
    ]
