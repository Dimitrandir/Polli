from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Article",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200, verbose_name="заглавие")),
                ("slug", models.SlugField(allow_unicode=True, max_length=200, unique=True, verbose_name="slug")),
                ("excerpt", models.TextField(blank=True, verbose_name="кратко описание")),
                ("body", models.TextField(verbose_name="текст (Markdown)")),
                ("cover_image_url", models.URLField(blank=True, max_length=500, verbose_name="основна снимка")),
                ("tags", models.JSONField(blank=True, default=list, verbose_name="тагове")),
                ("published_at", models.DateTimeField(verbose_name="публикувана на")),
                ("is_published", models.BooleanField(default=True, verbose_name="публикувана")),
                (
                    "source_url",
                    models.URLField(
                        blank=True,
                        help_text="За пренасочване от sisesthetics.com.",
                        max_length=500,
                        verbose_name="адрес в стария сайт",
                    ),
                ),
            ],
            options={
                "verbose_name": "статия",
                "verbose_name_plural": "статии",
                "ordering": ["-published_at"],
            },
        ),
        migrations.CreateModel(
            name="Page",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200, verbose_name="заглавие")),
                ("slug", models.SlugField(allow_unicode=True, max_length=200, unique=True, verbose_name="slug")),
                ("body", models.TextField(verbose_name="текст (Markdown)")),
                ("is_published", models.BooleanField(default=True, verbose_name="публикувана")),
                ("source_url", models.URLField(blank=True, max_length=500, verbose_name="адрес в стария сайт")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="последна промяна")),
            ],
            options={
                "verbose_name": "страница",
                "verbose_name_plural": "страници",
                "ordering": ["title"],
            },
        ),
    ]
