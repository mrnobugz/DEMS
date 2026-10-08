from django.apps import AppConfig


class ClinicConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "clinic"
    verbose_name = "DEMSTA clinic"

    def ready(self) -> None:
        from clinic.admin_register import register_models

        register_models()
