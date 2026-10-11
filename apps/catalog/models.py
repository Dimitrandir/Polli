from django.core.validators import MinValueValidator
from django.db import models


class ServiceCategory(models.Model):
    """Top level of the menu, e.g. "Коса" or "Нокти"."""

    name = models.CharField("име", max_length=100)
    slug = models.SlugField("slug", max_length=100, unique=True)
    order = models.PositiveIntegerField("подредба", default=0)
    is_active = models.BooleanField("активна", default=True)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "категория"
        verbose_name_plural = "категории"

    def __str__(self):
        return self.name


class ServiceGroup(models.Model):
    """A group of related services inside a category, e.g. "Гел лак"."""

    category = models.ForeignKey(
        ServiceCategory, on_delete=models.CASCADE, related_name="groups", verbose_name="категория"
    )
    name = models.CharField("име", max_length=100)
    description = models.TextField("описание", blank=True)
    order = models.PositiveIntegerField("подредба", default=0)
    is_active = models.BooleanField("активна", default=True)

    class Meta:
        ordering = ["category__order", "order", "name"]
        verbose_name = "група услуги"
        verbose_name_plural = "групи услуги"

    def __str__(self):
        return f"{self.category} / {self.name}"


class Service(models.Model):
    group = models.ForeignKey(ServiceGroup, on_delete=models.PROTECT, related_name="services", verbose_name="група")
    name = models.CharField("име", max_length=200)
    description = models.TextField("описание", blank=True)
    price = models.DecimalField("цена (EUR)", max_digits=8, decimal_places=2, validators=[MinValueValidator(0)])
    duration_minutes = models.PositiveIntegerField("продължителност (мин.)", validators=[MinValueValidator(5)])
    buffer_minutes = models.PositiveIntegerField(
        "време за подготовка след услугата (мин.)",
        default=0,
        help_text="Време, в което специалистът остава зает след края на услугата (почистване, подготовка).",
    )
    resources = models.ManyToManyField(
        "staff.Resource",
        blank=True,
        related_name="services",
        verbose_name="необходими ресурси",
        help_text="Работни места или уреди, които услугата заема (напр. мивка, маникюрна маса).",
    )
    order = models.PositiveIntegerField("подредба", default=0)
    is_active = models.BooleanField("активна", default=True)
    is_online_bookable = models.BooleanField(
        "онлайн резервация", default=True, help_text="Ако е изключено, услугата се записва само от салона."
    )

    class Meta:
        ordering = ["group__category__order", "group__order", "order", "name"]
        verbose_name = "услуга"
        verbose_name_plural = "услуги"

    def __str__(self):
        return self.name
