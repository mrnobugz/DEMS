class ClinicRouter:
    """Clinic tables live in the FastAPI database. Django auth uses its own file."""

    clinic_app = "clinic"

    def db_for_read(self, model, **hints):
        if model._meta.app_label == self.clinic_app:
            return "clinic"
        return "default"

    def db_for_write(self, model, **hints):
        if model._meta.app_label == self.clinic_app:
            return "clinic"
        return "default"

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label == self.clinic_app:
            return False
        return db == "default"
