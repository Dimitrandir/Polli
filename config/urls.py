from django.contrib import admin
from django.urls import include, path

from apps.bookings import api as bookings_api
from apps.catalog import api as catalog_api
from apps.staff import api as staff_api

admin.site.site_header = "SIS Esthetics – администрация"
admin.site.site_title = "SIS Esthetics"
admin.site.index_title = "Управление на салона"

api_urlpatterns = [
    path("categories/", catalog_api.CategoryListView.as_view(), name="category-list"),
    path("services/", catalog_api.ServiceListView.as_view(), name="service-list"),
    path("services/<int:pk>/", catalog_api.ServiceDetailView.as_view(), name="service-detail"),
    path("specialists/", staff_api.SpecialistListView.as_view(), name="specialist-list"),
    path("availability/", bookings_api.AvailabilityView.as_view(), name="availability"),
    path("bookings/", bookings_api.BookingCreateView.as_view(), name="booking-create"),
    path("bookings/<uuid:token>/", bookings_api.BookingByTokenView.as_view(), name="booking-detail"),
    path("bookings/<uuid:token>/cancel/", bookings_api.BookingCancelView.as_view(), name="booking-cancel"),
    path("me/bookings/", bookings_api.MyBookingsView.as_view(), name="my-bookings"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include((api_urlpatterns, "api"))),
]
