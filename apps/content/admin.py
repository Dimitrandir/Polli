from django.contrib import admin

from .models import Article, MediaArticle, Page


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ["title", "published_at", "is_published"]
    list_filter = ["is_published"]
    list_editable = ["is_published"]
    search_fields = ["title", "body"]
    prepopulated_fields = {"slug": ["title"]}
    date_hierarchy = "published_at"


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ["title", "slug", "is_published", "updated_at"]
    list_editable = ["is_published"]
    search_fields = ["title", "body"]
    prepopulated_fields = {"slug": ["title"]}


@admin.register(MediaArticle)
class MediaArticleAdmin(admin.ModelAdmin):
    list_display = ["title", "outlet", "published_on", "article", "has_text", "is_published"]
    raw_id_fields = ["article"]
    list_filter = ["is_published", "outlet"]
    list_editable = ["is_published"]
    search_fields = ["title", "outlet", "summary", "body"]
    date_hierarchy = "published_on"

    @admin.display(boolean=True, description="текст за асистента")
    def has_text(self, obj):
        return bool(obj.body.strip()) or obj.article_id is not None
