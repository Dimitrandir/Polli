from rest_framework import generics, serializers

from .models import Article, Page

ARTICLE_LIST_FIELDS = ["slug", "title", "excerpt", "cover_image_url", "tags", "published_at"]


class ArticleListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = ARTICLE_LIST_FIELDS


class ArticleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = [*ARTICLE_LIST_FIELDS, "body"]


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ["slug", "title", "body", "updated_at"]


class ArticleListView(generics.ListAPIView):
    """Published articles, newest first, without the body. Filter: ?tag=<tag>."""

    serializer_class = ArticleListSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Article.objects.filter(is_published=True)
        tag = self.request.query_params.get("tag")
        if tag:
            qs = qs.filter(tags__contains=[tag])
        return qs


class ArticleDetailView(generics.RetrieveAPIView):
    serializer_class = ArticleSerializer
    queryset = Article.objects.filter(is_published=True)
    lookup_field = "slug"


class PageDetailView(generics.RetrieveAPIView):
    serializer_class = PageSerializer
    queryset = Page.objects.filter(is_published=True)
    lookup_field = "slug"
