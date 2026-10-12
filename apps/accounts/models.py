from django.db import models


class LoginCode(models.Model):
    """A one-time code sent by email to log a client in. Only a hash of the code is stored."""

    email = models.EmailField("имейл", db_index=True)
    code_hash = models.CharField(max_length=64)
    attempts = models.PositiveSmallIntegerField("опити", default=0)
    created_at = models.DateTimeField("изпратен", auto_now_add=True)
    used_at = models.DateTimeField("използван", null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "код за вход"
        verbose_name_plural = "кодове за вход"

    def __str__(self):
        return f"{self.email} ({self.created_at:%d.%m.%Y %H:%M})"
