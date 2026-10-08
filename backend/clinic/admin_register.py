from django.contrib import admin


_registered = False


def register_models() -> None:
    global _registered
    if _registered:
        return
    from django.apps import apps

    _registered = True
    for model in apps.get_app_config("clinic").get_models():
        if admin.site.is_registered(model):
            continue
        text_fields = [
            field.name
            for field in model._meta.fields
            if field.get_internal_type() in {"CharField", "TextField"} and field.name != "id"
        ][:4]
        display = [field.name for field in model._meta.fields[:8]]
        attrs = {"list_display": display}
        if text_fields:
            attrs["search_fields"] = text_fields
        admin.site.register(model, type(f"{model.__name__}Admin", (admin.ModelAdmin,), attrs))
