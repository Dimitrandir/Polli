from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.accounts import api as accounts_api
from apps.assistant import api as assistant_api
from apps.bookings import api as bookings_api
from apps.bookings import staff_api as team_api
from apps.catalog import api as catalog_api
from apps.catalog import staff_api as team_catalog_api
from apps.clients import api as clients_api
from apps.clients import staff_api as team_clients_api
from apps.content import api as content_api
from apps.salon import api as salon_api
from apps.salon import staff_api as team_salon_api
from apps.staff import api as staff_api
from apps.staff import staff_api as team_members_api

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
    # Client accounts.
    path("auth/session/", accounts_api.SessionView.as_view(), name="auth-session"),
    path("auth/email/", accounts_api.EmailCodeRequestView.as_view(), name="auth-email"),
    path("auth/email/verify/", accounts_api.EmailCodeLoginView.as_view(), name="auth-email-verify"),
    path("auth/google/", accounts_api.GoogleLoginView.as_view(), name="auth-google"),
    path("auth/logout/", accounts_api.LogoutView.as_view(), name="auth-logout"),
    path("me/", clients_api.ProfileView.as_view(), name="me"),
    path("me/export/", clients_api.ExportView.as_view(), name="me-export"),
    path("me/messages/", clients_api.MyMessagesView.as_view(), name="me-messages"),
    path("me/bookings/", bookings_api.MyBookingsView.as_view(), name="my-bookings"),
    path("salon/", salon_api.SalonInfoView.as_view(), name="salon"),
    path("articles/", content_api.ArticleListView.as_view(), name="article-list"),
    path("articles/<str:slug>/", content_api.ArticleDetailView.as_view(), name="article-detail"),
    path("pages/<str:slug>/", content_api.PageDetailView.as_view(), name="page-detail"),
    # The AI assistant.
    path("assistant/", assistant_api.StatusView.as_view(), name="assistant-status"),
    path("assistant/chat/", assistant_api.ChatView.as_view(), name="assistant-chat"),
    path("assistant/conversations/<uuid:pk>/", assistant_api.ConversationView.as_view(), name="assistant-conversation"),
    path(
        "assistant/proposals/<uuid:pk>/confirm/",
        assistant_api.ConfirmProposalView.as_view(),
        name="assistant-confirm",
    ),
    # The salon team's calendar.
    path("staff/session/", team_api.StaffSessionView.as_view(), name="staff-session"),
    path("staff/login/", team_api.StaffLoginView.as_view(), name="staff-login"),
    path("staff/logout/", team_api.StaffLogoutView.as_view(), name="staff-logout"),
    path("staff/day/", team_api.StaffDayView.as_view(), name="staff-day"),
    path("staff/week/", team_api.StaffWeekView.as_view(), name="staff-week"),
    path("staff/month/", team_api.StaffMonthView.as_view(), name="staff-month"),
    path("staff/services/", team_api.StaffServicesView.as_view(), name="staff-services"),
    path("staff/clients/", team_api.StaffClientSearchView.as_view(), name="staff-clients"),
    path("staff/clients/<int:pk>/", team_clients_api.StaffClientDetailView.as_view(), name="staff-client"),
    path("staff/clients/<int:pk>/notes/", team_clients_api.StaffClientNotesView.as_view(), name="staff-client-notes"),
    path(
        "staff/clients/<int:pk>/messages/",
        team_clients_api.StaffClientMessagesView.as_view(),
        name="staff-client-messages",
    ),
    path("staff/notes/<int:pk>/", team_clients_api.StaffNoteDetailView.as_view(), name="staff-note"),
    path("staff/messages/", team_clients_api.StaffInboxView.as_view(), name="staff-inbox"),
    path("staff/bookings/", team_api.StaffBookingCreateView.as_view(), name="staff-booking-create"),
    path("staff/bookings/<int:pk>/", team_api.StaffBookingDetailView.as_view(), name="staff-booking-detail"),
    path("staff/bookings/<int:pk>/cancel/", team_api.StaffBookingCancelView.as_view(), name="staff-booking-cancel"),
    path("staff/bookings/<int:pk>/move/", team_api.StaffBookingMoveView.as_view(), name="staff-booking-move"),
    path("staff/time-off/", team_api.StaffTimeOffCreateView.as_view(), name="staff-time-off-create"),
    path("staff/time-off/<int:pk>/", team_api.StaffTimeOffDetailView.as_view(), name="staff-time-off-detail"),
    # Managing the salon from the team's side.
    path("staff/team/", team_members_api.TeamView.as_view(), name="staff-team"),
    path("staff/team/<int:pk>/", team_members_api.TeamMemberView.as_view(), name="staff-team-member"),
    path("staff/team/<int:pk>/hours/", team_members_api.TeamHoursView.as_view(), name="staff-team-hours"),
    path("staff/team/<int:pk>/photo/", team_members_api.TeamPhotoView.as_view(), name="staff-team-photo"),
    path("staff/catalog/", team_catalog_api.CatalogView.as_view(), name="staff-catalog"),
    path("staff/catalog/services/", team_catalog_api.ServiceCreateView.as_view(), name="staff-service-create"),
    path("staff/catalog/services/<int:pk>/", team_catalog_api.ServiceDetailView.as_view(), name="staff-service"),
    path("staff/catalog/groups/", team_catalog_api.GroupCreateView.as_view(), name="staff-group-create"),
    path("staff/catalog/groups/<int:pk>/", team_catalog_api.GroupDetailView.as_view(), name="staff-group"),
    path("staff/settings/", team_salon_api.SalonSettingsView.as_view(), name="staff-settings"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include((api_urlpatterns, "api"))),
]

# In production the web server serves uploaded files; this only works with DEBUG on.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
