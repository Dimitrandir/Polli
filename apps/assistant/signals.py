from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.content.models import Article

from .search import clear_index


@receiver(post_save, sender=Article)
@receiver(post_delete, sender=Article)
def article_changed(**kwargs):
    clear_index()
