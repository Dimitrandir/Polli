from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="LoginCode",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(db_index=True, max_length=254, verbose_name="имейл")),
                ("code_hash", models.CharField(max_length=64)),
                ("attempts", models.PositiveSmallIntegerField(default=0, verbose_name="опити")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="изпратен")),
                ("used_at", models.DateTimeField(blank=True, null=True, verbose_name="използван")),
            ],
            options={
                "verbose_name": "код за вход",
                "verbose_name_plural": "кодове за вход",
                "ordering": ["-created_at"],
            },
        ),
    ]
