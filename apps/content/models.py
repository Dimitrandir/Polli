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


class MediaArticle(models.Model):
    """An interview or article by the salon's team published by another outlet.

    The site shows the outlet, date, title and our short summary with a link to the original. The full text is
    kept only for the assistant, which quotes from it and always links to the original publication: the rights
    to the text belong to the outlet.
    """

    title = models.CharField("заглавие", max_length=300)
    slug = models.SlugField("slug", max_length=200, unique=True)
    outlet = models.CharField("медия", max_length=120, help_text="Например „Жената днес“.")
    outlet_site = models.CharField("сайт на медията", max_length=120, blank=True, help_text="Например jenatadnes.com.")
    url = models.URLField("адрес на публикацията", max_length=500, blank=True)
    article = models.ForeignKey(
        Article,
        verbose_name="статия при нас",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="media_mentions",
        help_text="Наша статия за същата публикация, ако има. Тогава асистентът ползва нея.",
    )
    published_on = models.DateField("дата на публикуване", null=True, blank=True)
    summary = models.TextField("кратко резюме", blank=True, help_text="Показва се в сайта. Със свои думи, не копие.")
    body = models.TextField(
        "бележки за асистента (Markdown)",
        blank=True,
        help_text="Бележки със свои думи по оригинала. Не се показват в сайта; ползва ги AI асистентът с линк към "
        "оригинала. Пазят се в data/press и import_site_content ги презаписва оттам.",
    )
    is_published = models.BooleanField("показва се", default=True)

    class Meta:
        ordering = [models.F("published_on").desc(nulls_last=True), "title"]
        verbose_name = "публикация в медиите"
        verbose_name_plural = "публикации в медиите"

    def __str__(self):
        return f"{self.outlet}: {self.title}"
