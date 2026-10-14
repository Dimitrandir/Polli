from django.contrib import admin
from django.utils.html import format_html, format_html_join

from .models import BookingProposal, Conversation


class ProposalInline(admin.TabularInline):
    model = BookingProposal
    fields = ["start_at", "summary_text", "booking", "created_at"]
    readonly_fields = fields
    extra = 0
    can_delete = False

    @admin.display(description="услуги")
    def summary_text(self, proposal):
        items = proposal.summary.get("items", [])
        return ", ".join(f"{i['service']} ({i['specialist']})" for i in items)

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """What visitors ask the assistant: useful to see which topics the articles are missing."""

    list_display = ["__str__", "user_turns", "user", "updated_at"]
    date_hierarchy = "updated_at"
    fields = ["user", "created_at", "updated_at", "conversation_text"]
    readonly_fields = fields
    inlines = [ProposalInline]

    @admin.display(description="въпроси")
    def user_turns(self, conversation):
        return conversation.user_turns

    @admin.display(description="разговор")
    def conversation_text(self, conversation):
        return format_html(
            "<div style='max-width:48rem'>{}</div>",
            format_html_join(
                "",
                "<p style='white-space:pre-line;margin:0 0 .75rem'><b>{}:</b> {}</p>",
                (("Клиент" if m["role"] == "user" else "Асистент", m["text"]) for m in conversation.transcript),
            ),
        )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
