import unittest

from app.models import Clinic, User


class TenantRelationshipTests(unittest.TestCase):
    def test_user_clinic_id_has_foreign_key_to_clinics(self) -> None:
        clinic_id_column = User.__table__.c.clinic_id

        self.assertTrue(clinic_id_column.foreign_keys, "User.clinic_id should reference clinics.id")
        foreign_tables = {foreign_key.column.table.name for foreign_key in clinic_id_column.foreign_keys}
        self.assertIn("clinics", foreign_tables)

        foreign_columns = {foreign_key.column.name for foreign_key in clinic_id_column.foreign_keys}
        self.assertIn("id", foreign_columns)


if __name__ == "__main__":
    unittest.main()
