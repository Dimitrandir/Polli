from rest_framework import generics, serializers

from .models import Specialist


class SpecialistServiceSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="service.id")
    name = serializers.CharField(source="service.name")
    price = serializers.DecimalField(max_digits=8, decimal_places=2)
    duration_minutes = serializers.IntegerField()


class SpecialistSerializer(serializers.ModelSerializer):
    photo = serializers.ImageField(read_only=True, use_url=True)
    services = serializers.SerializerMethodField()

    class Meta:
        model = Specialist
        fields = ["id", "name", "title", "bio", "photo", "services"]

    def get_services(self, specialist):
        rows = [ss for ss in specialist.specialist_services.all() if ss.service.is_active]
        return SpecialistServiceSerializer(rows, many=True).data


class SpecialistListView(generics.ListAPIView):
    """Team members who take online bookings. Filter: ?service=<id>."""

    serializer_class = SpecialistSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Specialist.objects.filter(is_active=True, is_online_bookable=True).prefetch_related(
            "specialist_services__service"
        )
        service = self.request.query_params.get("service", "")
        if service.isdigit():
            qs = qs.filter(specialist_services__service_id=service)
        return qs.distinct()
