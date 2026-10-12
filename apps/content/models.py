from django.db import models


class Article(models.Model):
    """A blog article. The body is Markdown."""

    title = models.CharField("заглавие", max_length=200)
    slug = models.SlugField("slug", max_length=200, unique=True, allow_unicode=True)
    excerpt = models.TextField("кратко описание", blank=True)
    body = models.TextField("текст (Markdown)")
    cover_image_url = models.URLField("основна снимка", max_length=500, blank=True)
    tags = models.JSONField("тагове", default=list, blank=True)
    published_at = models.DateTimeField("публикувана на")
    is_published = models.BooleanField("публикувана", default=True)
    source_url = models.URLField(
        "адрес в стария сайт", max_length=500, blank=True, help_text="За пренасочване от sisesthetics.com."
    )

    class Meta:
        ordering = ["-published_at"]
        verbose_name = "статия"
        verbose_name_plural = "статии"

    def __str__(self):
        return self.title


class Page(models.Model):
    """A standalone text page such as "За нас" or "Общи условия". The body is Markdown."""

    title = models.CharField("заглавие", max_length=200)
    slug = models.SlugField("slug", max_length=200, unique=True, allow_unicode=True)
    body = models.TextField("текст (Markdown)")
    is_published = models.BooleanField("публикувана", default=True)
    source_url = models.URLField("адрес в стария сайт", max_length=500, blank=True)
    updated_at = models.DateTimeField("последна промяна", auto_now=True)

    class Meta:
        ordering = ["title"]
        verbose_name = "страница"
        verbose_name_plural = "страници"

    def __str__(self):
        return self.title
