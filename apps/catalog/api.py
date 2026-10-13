from django.db.models import Prefetch
from rest_framework import generics, serializers

from .models import Service, ServiceCategory, ServiceGroup


def active_services():
    return Service.objects.filter(is_active=True, group__is_active=True, group__category__is_active=True)


class ServiceSpecialistSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="specialist.id")
    name = serializers.CharField(source="specialist.name")
    price = serializers.DecimalField(max_digits=8, decimal_places=2)
    duration_minutes = serializers.IntegerField()


class ServiceSerializer(serializers.ModelSerializer):
    group = serializers.IntegerField(source="group_id")
    category = serializers.SlugRelatedField(source="group.category", slug_field="slug", read_only=True)
    specialists = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id",
            "name",
            "option",
            "description",
            "price",
            "duration_minutes",
            "is_online_bookable",
            "group",
            "category",
            "specialists",
        ]

    def get_specialists(self, service):
        rows = [
            ss
            for ss in service.specialist_services.all()
            if ss.specialist.is_active and ss.specialist.is_online_bookable
        ]
        return ServiceSpecialistSerializer(rows, many=True).data


class GroupSerializer(serializers.ModelSerializer):
    services = ServiceSerializer(many=True, source="active_services")

    class Meta:
        model = ServiceGroup
        fields = ["id", "name", "description", "services"]


class CategorySerializer(serializers.ModelSerializer):
    groups = GroupSerializer(many=True, source="active_groups")

    class Meta:
        model = ServiceCategory
        fields = ["id", "name", "slug", "groups"]


class CategoryListView(generics.ListAPIView):
    """The whole service menu: categories → groups → services."""

    serializer_class = CategorySerializer
    pagination_class = None

    def get_queryset(self):
        services = active_services().prefetch_related("specialist_services__specialist", "group__category")
        groups = ServiceGroup.objects.filter(is_active=True).prefetch_related(
            Prefetch("services", queryset=services, to_attr="active_services")
        )
        return ServiceCategory.objects.filter(is_active=True).prefetch_related(
            Prefetch("groups", queryset=groups, to_attr="active_groups")
        )


class ServiceListView(generics.ListAPIView):
    """Flat list of services. Filters: ?category=<slug>&group=<id>&specialist=<id>."""

    serializer_class = ServiceSerializer
    pagination_class = None

    def get_queryset(self):
        qs = active_services().select_related("group__category").prefetch_related("specialist_services__specialist")
        params = self.request.query_params
        if params.get("category"):
            qs = qs.filter(group__category__slug=params["category"])
        if params.get("group", "").isdigit():
            qs = qs.filter(group_id=params["group"])
        if params.get("specialist", "").isdigit():
            qs = qs.filter(specialist_services__specialist_id=params["specialist"])
        return qs.distinct()


class ServiceDetailView(generics.RetrieveAPIView):
    serializer_class = ServiceSerializer

    def get_queryset(self):
        return active_services().select_related("group__category").prefetch_related("specialist_services__specialist")
