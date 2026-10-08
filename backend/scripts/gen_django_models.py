"""Emit unmanaged Django models from the FastAPI SQLAlchemy metadata."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.db.session import Base  # noqa: E402
from app.models import *  # noqa: F401,F403,E402

RESERVED = {
    "class",
    "def",
    "return",
    "from",
    "import",
    "pass",
    "global",
    "type",
    "id",
}

TYPE_MAP = {
    "String": "models.CharField",
    "Text": "models.TextField",
    "Integer": "models.IntegerField",
    "Float": "models.FloatField",
    "Boolean": "models.BooleanField",
    "Date": "models.DateField",
    "DateTime": "models.DateTimeField",
    "JSON": "models.JSONField",
    "Uuid": "models.UUIDField",
}


def class_name(table: str) -> str:
    parts = table.split("_")
    return "".join(part.capitalize() for part in parts)


def field_for(column) -> str:
    type_name = column.type.__class__.__name__
    kwargs = []
    if column.primary_key:
        kwargs.append("primary_key=True")
    if column.nullable and not column.primary_key:
        kwargs.append("null=True")
        kwargs.append("blank=True")
    if column.unique and not column.primary_key:
        kwargs.append("unique=True")
    if column.index and not column.primary_key and not column.unique:
        kwargs.append("db_index=True")

    fk = next(iter(column.foreign_keys), None)
    if fk is not None:
        target = class_name(fk.column.table.name)
        on_delete = "models.SET_NULL" if column.nullable else "models.CASCADE"
        kwargs.insert(0, f"on_delete={on_delete}")
        kwargs.append(f"db_column='{column.name}'")
        kwargs.append(f"related_name='{class_name(column.table.name).lower()}_{column.name}'")
        field = "models.ForeignKey"
        if column.unique:
            field = "models.OneToOneField"
            kwargs = [item for item in kwargs if item != "unique=True"]
        body = ", ".join([f"'{target}'"] + kwargs)
        name = column.name
        if name.endswith("_id"):
            name = name[: -3] or name
        if name in RESERVED:
            name = f"{name}_ref"
        return f"    {name} = {field}({body})"

    django_type = TYPE_MAP.get(type_name, "models.TextField")
    if type_name == "String":
        length = getattr(column.type, "length", None) or 255
        kwargs.insert(0, f"max_length={length}")
    if type_name == "Boolean" and not column.nullable:
        kwargs.append("default=False")
    if column.primary_key and type_name in {"String", "Uuid"}:
        kwargs.append("editable=False")
    name = column.name
    if name in RESERVED and name != "id":
        kwargs.append(f"db_column='{name}'")
        name = f"{name}_value"
    body = ", ".join(kwargs) if kwargs else ""
    return f"    {name} = {django_type}({body})"


def main() -> None:
    lines = [
        "from django.db import models",
        "",
        "",
        "class DemstaModel(models.Model):",
        "    class Meta:",
        "        abstract = True",
        "        managed = False",
        "",
    ]
    seen = set()
    for table in Base.metadata.sorted_tables:
        name = class_name(table.name)
        if name in seen:
            name = name + "Row"
        seen.add(name)
        lines.append(f"class {name}(DemstaModel):")
        for column in table.columns:
            lines.append(field_for(column))
        lines.append("    class Meta:")
        lines.append("        managed = False")
        lines.append(f"        db_table = '{table.name}'")
        lines.append("")
    out = Path(__file__).resolve().parents[1] / "clinic" / "models.py"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(Base.metadata.sorted_tables)} tables)")


if __name__ == "__main__":
    main()
