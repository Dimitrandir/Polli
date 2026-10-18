"""Who may do what on the team's side.

An administrator manages everything: every specialist, the services and the salon settings.
Everyone else manages only themselves, but anyone may book a client with any colleague.
Administrators are superusers or members of the "Администратори" group, which an administrator
grants from the team page.
"""

from django.contrib.auth.models import Group
from rest_framework import permissions

ADMIN_GROUP = "Администратори"


def is_salon_admin(user):
    if not (user and user.is_authenticated and user.is_active and user.is_staff):
        return False
    if user.is_superuser:
        return True
    cached = getattr(user, "_is_salon_admin", None)
    if cached is None:
        cached = user.groups.filter(name=ADMIN_GROUP).exists()
        user._is_salon_admin = cached
    return cached


def set_salon_admin(user, value):
    group, _ = Group.objects.get_or_create(name=ADMIN_GROUP)
    if value:
        user.groups.add(group)
    else:
        user.groups.remove(group)
    user._is_salon_admin = bool(value) or user.is_superuser


def own_specialist_id(user):
    """The specialist record of a logged-in team member, if they have one."""
    if not (user and user.is_authenticated):
        return None
    if not hasattr(user, "_own_specialist_id"):
        from .models import Specialist

        user._own_specialist_id = Specialist.objects.filter(user=user).values_list("pk", flat=True).first()
    return user._own_specialist_id


def staff_name(user):
    """How the team sees a colleague's name: the specialist name, else the account's name."""
    if user is None:
        return ""
    from .models import Specialist

    name = Specialist.objects.filter(user=user).values_list("name", flat=True).first()
    return name or user.get_full_name() or user.get_username()


def can_manage_specialist(user, specialist_id):
    return is_salon_admin(user) or (specialist_id is not None and own_specialist_id(user) == specialist_id)


class IsSalonAdmin(permissions.BasePermission):
    message = "Само администратор може да прави това."

    def has_permission(self, request, view):
        return is_salon_admin(request.user)


class IsSalonAdminOrReadOnly(permissions.BasePermission):
    """Everyone on the team reads; only an administrator writes."""

    message = IsSalonAdmin.message

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active and user.is_staff):
            return False
        return request.method in permissions.SAFE_METHODS or is_salon_admin(user)
