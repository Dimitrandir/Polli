"""The services page for the team: the whole price list, also what is switched off.

Everyone on the team can look; only an administrator changes services, prices and who does them.
Services are never deleted (past bookings point to them): they are switched off instead.
"""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.staff.models import Specialist, SpecialistService
from apps.staff.roles import IsSalonAdminOrReadOnly

from .models import Service, ServiceCategory, ServiceGroup


def service_payload(service):
    return {
        "id": service.pk,
        "group": service.group_id,
        "name": service.name,
        "option": service.option,
        "display_name": service.display_name,
        "description": service.description,
        "price": f"{service.price:.2f}",
        "duration_minutes": service.duration_minutes,
        "buffer_minutes": service.buffer_minutes,
        "order": service.order,
        "is_active": service.is_active,
        "is_online_bookable": service.is_online_bookable,
        "specialists": [
            {
                "id": ss.specialist_id,
                "price": f"{ss.price_override:.2f}" if ss.price_override is not None else None,
                "duration_minutes": ss.duration_override,
            }
            for ss in service.specialist_services.all()
        ],
    }


def _service(pk):
    return get_object_or_404(Service.objects.prefetch_related("specialist_services"), pk=pk)


class CatalogView(APIView):
    """Categories → groups → services, with the specialists who do each service."""

    permission_classes = [IsSalonAdminOrReadOnly]

    def get(self, request):
        categories = ServiceCategory.objects.prefetch_related("groups__services__specialist_services")
        return Response(
            {
                "categories": [
                    {
                        "id": c.pk,
                        "name": c.name,
                        "is_active": c.is_active,
                        "groups": [
                            {
                                "id": g.pk,
                                "name": g.name,
                                "is_active": g.is_active,
                                "services": [service_payload(s) for s in g.services.all()],
                            }
                            for g in c.groups.all()
                        ],
                    }
                    for c in categories
                ],
                "specialists": [
                    {"id": s.pk, "name": s.name, "is_active": s.is_active} for s in Specialist.objects.all()
                ],
            }
        )


class OfferSerializer(serializers.Serializer):
    id = serializers.PrimaryKeyRelatedField(queryset=Specialist.objects.all())
    price = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=0, required=False, allow_null=True)
    duration_minutes = serializers.IntegerField(min_value=5, required=False, allow_null=True)


class ServiceInputSerializer(serializers.Serializer):
    group = serializers.PrimaryKeyRelatedField(queryset=ServiceGroup.objects.all())
    name = serializers.CharField(max_length=200)
    option = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    description = serializers.CharField(required=False, allow_blank=True, default="", max_length=5000)
    price = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=0)
    duration_minutes = serializers.IntegerField(min_value=5, max_value=12 * 60)
    buffer_minutes = serializers.IntegerField(min_value=0, max_value=4 * 60, required=False, default=0)
    order = serializers.IntegerField(min_value=0, required=False, default=0)
    is_active = serializers.BooleanField(required=False, default=True)
    is_online_bookable = serializers.BooleanField(required=False, default=True)
    specialists = OfferSerializer(many=True, required=False)

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Въведете име на услугата.")
        return value.strip()


def _save(service, v):
    offers = v.pop("specialists", None)
    for field, value in v.items():
        setattr(service, field, value.strip() if isinstance(value, str) else value)
    service.save()
    if offers is None:
        return
    keep = {o["id"].pk: o for o in offers}
    SpecialistService.objects.filter(service=service).exclude(specialist_id__in=keep).delete()
    for specialist_id, offer in keep.items():
        SpecialistService.objects.update_or_create(
            service=service,
            specialist_id=specialist_id,
            defaults={
                "price_override": offer.get("price"),
                "duration_override": offer.get("duration_minutes"),
            },
        )


class ServiceCreateView(APIView):
    permission_classes = [IsSalonAdminOrReadOnly]

    def post(self, request):
        data = ServiceInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            service = Service(group=data.validated_data["group"])
            _save(service, dict(data.validated_data))
        return Response(service_payload(_service(service.pk)), status=status.HTTP_201_CREATED)


class ServiceDetailView(APIView):
    permission_classes = [IsSalonAdminOrReadOnly]

    def get(self, request, pk):
        return Response(service_payload(_service(pk)))

    def patch(self, request, pk):
        service = _service(pk)
        data = ServiceInputSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            _save(service, dict(data.validated_data))
        return Response(service_payload(_service(pk)))


class GroupInputSerializer(serializers.Serializer):
    category = serializers.PrimaryKeyRelatedField(queryset=ServiceCategory.objects.all())
    name = serializers.CharField(max_length=100)
    is_active = serializers.BooleanField(required=False, default=True)


class GroupCreateView(APIView):
    """A new group of services inside a category, e.g. "Терапии" under "Коса"."""

    permission_classes = [IsSalonAdminOrReadOnly]

    def post(self, request):
        data = GroupInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        order = ServiceGroup.objects.filter(category=v["category"]).count()
        group = ServiceGroup.objects.create(
            category=v["category"], name=v["name"].strip(), is_active=v["is_active"], order=order
        )
        return Response({"id": group.pk, "name": group.name, "is_active": group.is_active, "services": []}, 201)


class GroupDetailView(APIView):
    permission_classes = [IsSalonAdminOrReadOnly]

    def patch(self, request, pk):
        group = get_object_or_404(ServiceGroup, pk=pk)
        data = GroupInputSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        for field, value in data.validated_data.items():
            setattr(group, field, value.strip() if isinstance(value, str) else value)
        group.save()
        return Response({"id": group.pk, "name": group.name, "is_active": group.is_active})
