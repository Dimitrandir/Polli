from django.contrib import admin

from .models import Article, Page


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
