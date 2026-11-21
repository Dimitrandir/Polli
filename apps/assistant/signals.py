from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.content.models import Article, MediaArticle

from .search import clear_index


@receiver(post_save, sender=Article)
@receiver(post_delete, sender=Article)
@receiver(post_save, sender=MediaArticle)
@receiver(post_delete, sender=MediaArticle)
def article_changed(**kwargs):
    clear_index()
