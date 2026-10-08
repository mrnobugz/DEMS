from django.db import models


class DemstaModel(models.Model):
    class Meta:
        abstract = True
        managed = False

class AuditLogs(DemstaModel):
    clinic_id = models.CharField(max_length=36, null=True, blank=True, db_index=True)
    actor_id = models.CharField(max_length=36, null=True, blank=True, db_index=True)
    action = models.CharField(max_length=80)
    resource_type = models.CharField(max_length=80)
    resource_id = models.CharField(max_length=36, null=True, blank=True)
    before_data = models.TextField(null=True, blank=True)
    after_data = models.TextField(null=True, blank=True)
    ip_address = models.CharField(max_length=64, null=True, blank=True)
    created_at = models.DateTimeField(db_index=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    class Meta:
        managed = False
        db_table = 'audit_logs'

class Clinics(DemstaModel):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=32, unique=True)
    address = models.CharField(max_length=500, null=True, blank=True)
    phone = models.CharField(max_length=40, null=True, blank=True)
    email = models.CharField(max_length=200, null=True, blank=True)
    timezone = models.CharField(max_length=64)
    currency = models.CharField(max_length=8)
    is_active = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'clinics'

class LabCases(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='labcases_patient_id')
    dentist = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='dentist_id', related_name='labcases_dentist_id')
    tooth = models.CharField(max_length=16, null=True, blank=True)
    shade = models.CharField(max_length=40, null=True, blank=True)
    case_type = models.CharField(max_length=80)
    status = models.CharField(max_length=32, db_index=True)
    lab_name = models.CharField(max_length=200, null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    fitted_at = models.DateTimeField(null=True, blank=True)
    lab_cost = models.FloatField()
    notes = models.TextField(null=True, blank=True)
    restoration = models.ForeignKey('Restorations', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='restoration_id', related_name='labcases_restoration_id')
    restoration_case = models.ForeignKey('RestorationCases', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='restoration_case_id', related_name='labcases_restoration_case_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='labcases_clinic_id')
    class Meta:
        managed = False
        db_table = 'lab_cases'

class RestorationCases(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='restorationcases_patient_id')
    primary_tooth = models.CharField(max_length=8)
    case_type = models.CharField(max_length=80)
    status = models.CharField(max_length=32, db_index=True)
    warranty_months = models.IntegerField()
    recall_due_at = models.DateField(null=True, blank=True)
    lab_case = models.ForeignKey('LabCases', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='lab_case_id', related_name='restorationcases_lab_case_id')
    fee_code = models.CharField(max_length=40, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='created_by_id', related_name='restorationcases_created_by_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='restorationcases_clinic_id')
    class Meta:
        managed = False
        db_table = 'restoration_cases'

class Restorations(DemstaModel):
    case = models.ForeignKey('RestorationCases', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='case_id', related_name='restorations_case_id')
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='restorations_patient_id')
    tooth_number = models.CharField(max_length=8, db_index=True)
    surfaces = models.CharField(max_length=16)
    restoration_type = models.CharField(max_length=80)
    cavity_size = models.CharField(max_length=8, null=True, blank=True)
    blacks_class = models.CharField(max_length=8, null=True, blank=True)
    material = models.CharField(max_length=80, null=True, blank=True)
    shade = models.CharField(max_length=40, null=True, blank=True)
    status = models.CharField(max_length=32, db_index=True)
    chart_entry = models.ForeignKey('DentalChartEntries', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='chart_entry_id', related_name='restorations_chart_entry_id')
    notes = models.TextField(null=True, blank=True)
    recorded_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='recorded_by_id', related_name='restorations_recorded_by_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='restorations_clinic_id')
    class Meta:
        managed = False
        db_table = 'restorations'

class AppointmentTypes(DemstaModel):
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=40)
    duration_minutes = models.IntegerField()
    color = models.CharField(max_length=16)
    default_fee = models.FloatField()
    is_active = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='appointmenttypes_clinic_id')
    class Meta:
        managed = False
        db_table = 'appointment_types'

class CatalogCategories(DemstaModel):
    name = models.CharField(max_length=80)
    slug = models.CharField(max_length=80, db_index=True)
    parent = models.ForeignKey('CatalogCategories', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='parent_id', related_name='catalogcategories_parent_id')
    sort_order = models.IntegerField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='catalogcategories_clinic_id')
    class Meta:
        managed = False
        db_table = 'catalog_categories'

class ConfigCatalogEntries(DemstaModel):
    kind = models.CharField(max_length=40, db_index=True)
    code = models.CharField(max_length=80)
    label = models.CharField(max_length=200)
    extra_json = models.TextField(null=True, blank=True)
    sort_order = models.IntegerField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='configcatalogentries_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'config_catalog_entries'

class ConfigTemplates(DemstaModel):
    kind = models.CharField(max_length=40, db_index=True)
    key = models.CharField(max_length=80)
    name = models.CharField(max_length=160)
    subject = models.CharField(max_length=300, null=True, blank=True)
    body = models.TextField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='configtemplates_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'config_templates'

class DiscountRules(DemstaModel):
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    percent = models.FloatField()
    max_amount = models.FloatField(null=True, blank=True)
    requires_role = models.CharField(max_length=40, null=True, blank=True)
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='discountrules_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'discount_rules'

class DomainEvents(DemstaModel):
    event_type = models.CharField(max_length=80, db_index=True)
    aggregate_type = models.CharField(max_length=80)
    aggregate_id = models.CharField(max_length=36, db_index=True)
    payload_json = models.TextField()
    occurred_at = models.DateTimeField(db_index=True)
    published_at = models.DateTimeField(null=True, blank=True)
    actor_id = models.CharField(max_length=36, null=True, blank=True, db_index=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='domainevents_clinic_id')
    class Meta:
        managed = False
        db_table = 'domain_events'

class DrugTemplates(DemstaModel):
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=80)
    default_dose = models.CharField(max_length=120)
    default_quantity = models.CharField(max_length=80)
    instructions = models.TextField(null=True, blank=True)
    form = models.CharField(max_length=40)
    strength = models.CharField(max_length=80, null=True, blank=True)
    route = models.CharField(max_length=40)
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='inventory_item_id', related_name='drugtemplates_inventory_item_id')
    reorder_level = models.FloatField()
    is_controlled = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='drugtemplates_clinic_id')
    class Meta:
        managed = False
        db_table = 'drug_templates'

class FeeSchedules(DemstaModel):
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    payer_kind = models.CharField(max_length=32)
    currency = models.CharField(max_length=8)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_default = models.BooleanField(default=False)
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='feeschedules_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'fee_schedules'

class Holidays(DemstaModel):
    holiday_date = models.DateField()
    name = models.CharField(max_length=160)
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='holidays_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'holidays'

class NumberSequences(DemstaModel):
    document_type = models.CharField(max_length=40)
    prefix = models.CharField(max_length=16)
    padding = models.IntegerField()
    next_value = models.IntegerField()
    year_reset = models.BooleanField(default=False)
    current_year = models.IntegerField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='numbersequences_clinic_id')
    class Meta:
        managed = False
        db_table = 'number_sequences'

class PaymentMethodConfigs(DemstaModel):
    code = models.CharField(max_length=40)
    label = models.CharField(max_length=120)
    sort_order = models.IntegerField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='paymentmethodconfigs_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'payment_method_configs'

class RestorationQualities(DemstaModel):
    restoration = models.OneToOneField('Restorations', on_delete=models.CASCADE, db_column='restoration_id', related_name='restorationqualities_restoration_id')
    marginal_adaptation = models.IntegerField(null=True, blank=True)
    contacts = models.IntegerField(null=True, blank=True)
    wear = models.IntegerField(null=True, blank=True)
    postop_sensitivity = models.IntegerField(null=True, blank=True)
    pulp_status = models.CharField(max_length=40, null=True, blank=True)
    color_match = models.IntegerField(null=True, blank=True)
    finishing = models.IntegerField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'restoration_qualities'

class RolePermissions(DemstaModel):
    role = models.CharField(max_length=40, db_index=True)
    permission_id = models.CharField(max_length=80)
    allowed = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='rolepermissions_clinic_id')
    class Meta:
        managed = False
        db_table = 'role_permissions'

class StockLocations(DemstaModel):
    code = models.CharField(max_length=32, db_index=True)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=20, db_index=True)
    is_active = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='stocklocations_clinic_id')
    class Meta:
        managed = False
        db_table = 'stock_locations'

class Suppliers(DemstaModel):
    name = models.CharField(max_length=200)
    contact_email = models.CharField(max_length=200, null=True, blank=True)
    contact_phone = models.CharField(max_length=40, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='suppliers_clinic_id')
    class Meta:
        managed = False
        db_table = 'suppliers'

class TaxRates(DemstaModel):
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    rate_bps = models.IntegerField()
    is_default = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='taxrates_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'tax_rates'

class Users(DemstaModel):
    clinic = models.ForeignKey('Clinics', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='clinic_id', related_name='users_clinic_id')
    email = models.CharField(max_length=200, db_index=True)
    hashed_password = models.CharField(max_length=255)
    full_name = models.CharField(max_length=200)
    role = models.CharField(max_length=40, db_index=True)
    phone = models.CharField(max_length=40, null=True, blank=True)
    is_active = models.BooleanField(default=False)
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.CharField(max_length=64, null=True, blank=True)
    failed_login_attempts = models.IntegerField()
    locked_until = models.DateTimeField(null=True, blank=True)
    specialty = models.CharField(max_length=120, null=True, blank=True)
    license_number = models.CharField(max_length=80, null=True, blank=True)
    extra_permissions = models.TextField(null=True, blank=True)
    denied_permissions = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'users'

class WorkingHours(DemstaModel):
    owner_type = models.CharField(max_length=20)
    owner_id = models.CharField(max_length=36, null=True, blank=True, db_index=True)
    day_of_week = models.IntegerField()
    starts_on = models.CharField(max_length=5)
    ends_on = models.CharField(max_length=5)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='workinghours_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'working_hours'

class InventoryItems(DemstaModel):
    sku = models.CharField(max_length=64, db_index=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=80)
    quantity = models.FloatField()
    reorder_level = models.FloatField()
    unit = models.CharField(max_length=40)
    unit_cost = models.FloatField()
    sale_price = models.FloatField()
    item_kind = models.CharField(max_length=20, db_index=True)
    billable_at_registration = models.BooleanField(db_index=True, default=False)
    target_department = models.CharField(max_length=32, null=True, blank=True)
    is_active = models.BooleanField(default=False)
    notes = models.TextField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    supplier = models.ForeignKey('Suppliers', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='supplier_id', related_name='inventoryitems_supplier_id')
    track_lots = models.BooleanField(default=False)
    requires_expiry = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='inventoryitems_clinic_id')
    class Meta:
        managed = False
        db_table = 'inventory_items'

class OrgDepartments(DemstaModel):
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    head_user = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='head_user_id', related_name='orgdepartments_head_user_id')
    stock_location = models.ForeignKey('StockLocations', on_delete=models.SET_NULL, null=True, blank=True, db_column='stock_location_id', related_name='orgdepartments_stock_location_id')
    sort_order = models.IntegerField()
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='orgdepartments_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'org_departments'

class Patients(DemstaModel):
    patient_code = models.CharField(max_length=32, db_index=True)
    hospital_reg_number = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, null=True, blank=True)
    last_name = models.CharField(max_length=100)
    national_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    date_of_birth = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=20, null=True, blank=True)
    marital_status = models.CharField(max_length=32, null=True, blank=True)
    occupation = models.CharField(max_length=120, null=True, blank=True)
    tribe_nation = models.CharField(max_length=120, null=True, blank=True)
    phone = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    email = models.CharField(max_length=200, null=True, blank=True)
    address = models.CharField(max_length=500, null=True, blank=True)
    po_box = models.CharField(max_length=80, null=True, blank=True)
    street = models.CharField(max_length=200, null=True, blank=True)
    house_number = models.CharField(max_length=40, null=True, blank=True)
    area_ward = models.CharField(max_length=120, null=True, blank=True)
    town_city = models.CharField(max_length=120, null=True, blank=True)
    emergency_contact_name = models.CharField(max_length=200, null=True, blank=True)
    emergency_contact_phone = models.CharField(max_length=40, null=True, blank=True)
    next_of_kin = models.CharField(max_length=200, null=True, blank=True)
    next_of_kin_relationship = models.CharField(max_length=80, null=True, blank=True)
    next_of_kin_phone = models.CharField(max_length=40, null=True, blank=True)
    guardian_name = models.CharField(max_length=200, null=True, blank=True)
    guardian_relationship = models.CharField(max_length=80, null=True, blank=True)
    guardian_phone = models.CharField(max_length=40, null=True, blank=True)
    history_of_presenting_complaint = models.TextField(null=True, blank=True)
    last_dental_visit = models.CharField(max_length=120, null=True, blank=True)
    smoking_status = models.CharField(max_length=40, null=True, blank=True)
    alcohol_use = models.CharField(max_length=40, null=True, blank=True)
    referral_source = models.CharField(max_length=200, null=True, blank=True)
    insurance_number = models.CharField(max_length=80, null=True, blank=True, db_index=True)
    chief_complaint = models.TextField(null=True, blank=True)
    allergies = models.TextField(null=True, blank=True)
    chronic_conditions = models.TextField(null=True, blank=True)
    current_medications = models.TextField(null=True, blank=True)
    dental_history = models.TextField(null=True, blank=True)
    family_social_history = models.TextField(null=True, blank=True)
    developmental_history = models.TextField(null=True, blank=True)
    pregnancy_trimester = models.IntegerField(null=True, blank=True)
    medical_history_json = models.TextField(null=True, blank=True)
    pain_assessment_json = models.TextField(null=True, blank=True)
    reported_symptoms_json = models.TextField(null=True, blank=True)
    caries_risk_score = models.FloatField(null=True, blank=True)
    hygiene_recall_due = models.DateField(null=True, blank=True)
    perio_risk_band = models.CharField(max_length=32, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    primary_dentist = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='primary_dentist_id', related_name='patients_primary_dentist_id')
    portal_enabled = models.BooleanField(default=False)
    portal_pin_hash = models.CharField(max_length=255, null=True, blank=True)
    registration_status = models.CharField(max_length=24, db_index=True)
    destination_department = models.CharField(max_length=32, null=True, blank=True)
    registration_finalized_at = models.DateTimeField(null=True, blank=True)
    has_outstanding = models.BooleanField(default=False)
    photo_storage_key = models.CharField(max_length=500, null=True, blank=True)
    photo_content_type = models.CharField(max_length=80, null=True, blank=True)
    merged_into = models.ForeignKey('Patients', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='merged_into_id', related_name='patients_merged_into_id')
    guarantor_patient = models.ForeignKey('Patients', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='guarantor_patient_id', related_name='patients_guarantor_patient_id')
    medical_history_reviewed_at = models.DateTimeField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='patients_clinic_id')
    class Meta:
        managed = False
        db_table = 'patients'

class PurchaseOrders(DemstaModel):
    supplier = models.ForeignKey('Suppliers', on_delete=models.CASCADE, db_index=True, db_column='supplier_id', related_name='purchaseorders_supplier_id')
    status = models.CharField(max_length=32, db_index=True)
    ordered_at = models.DateTimeField(null=True, blank=True)
    expected_at = models.DateField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    lines_json = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='purchaseorders_clinic_id')
    class Meta:
        managed = False
        db_table = 'purchase_orders'

class RefreshTokens(DemstaModel):
    user = models.ForeignKey('Users', on_delete=models.CASCADE, db_index=True, db_column='user_id', related_name='refreshtokens_user_id')
    token_hash = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    revoked = models.BooleanField(default=False)
    user_agent = models.CharField(max_length=400, null=True, blank=True)
    ip_address = models.CharField(max_length=64, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'refresh_tokens'

class Requisitions(DemstaModel):
    req_number = models.CharField(max_length=40, db_index=True)
    status = models.CharField(max_length=24, db_index=True)
    department = models.CharField(max_length=40, db_index=True)
    destination_location = models.ForeignKey('StockLocations', on_delete=models.SET_NULL, null=True, blank=True, db_column='destination_location_id', related_name='requisitions_destination_location_id')
    requested_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='requested_by_id', related_name='requisitions_requested_by_id')
    approved_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='approved_by_id', related_name='requisitions_approved_by_id')
    fulfilled_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='fulfilled_by_id', related_name='requisitions_fulfilled_by_id')
    notes = models.TextField(null=True, blank=True)
    reject_reason = models.CharField(max_length=300, null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    fulfilled_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='requisitions_clinic_id')
    class Meta:
        managed = False
        db_table = 'requisitions'

class StaffLeaves(DemstaModel):
    user = models.ForeignKey('Users', on_delete=models.CASCADE, db_index=True, db_column='user_id', related_name='staffleaves_user_id')
    starts_on = models.DateField()
    ends_on = models.DateField()
    leave_type = models.CharField(max_length=40)
    status = models.CharField(max_length=32)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='staffleaves_clinic_id')
    class Meta:
        managed = False
        db_table = 'staff_leaves'

class StaffShifts(DemstaModel):
    user = models.ForeignKey('Users', on_delete=models.CASCADE, db_index=True, db_column='user_id', related_name='staffshifts_user_id')
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    role_label = models.CharField(max_length=80, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='staffshifts_clinic_id')
    class Meta:
        managed = False
        db_table = 'staff_shifts'

class SystemSettings(DemstaModel):
    clinic = models.ForeignKey('Clinics', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='clinic_id', related_name='systemsettings_clinic_id')
    user = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='user_id', related_name='systemsettings_user_id')
    scope = models.CharField(max_length=16)
    key = models.CharField(max_length=120)
    value = models.TextField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'system_settings'

class AiSuggestions(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='patient_id', related_name='aisuggestions_patient_id')
    suggestion_type = models.CharField(max_length=60)
    payload_json = models.TextField()
    is_ai_suggested = models.BooleanField(default=False)
    reviewed = models.BooleanField(default=False)
    reviewer = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='reviewer_id', related_name='aisuggestions_reviewer_id')
    review_decision = models.CharField(max_length=40, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='aisuggestions_clinic_id')
    class Meta:
        managed = False
        db_table = 'ai_suggestions'

class ApprovalChains(DemstaModel):
    name = models.CharField(max_length=160)
    department = models.ForeignKey('OrgDepartments', on_delete=models.SET_NULL, null=True, blank=True, db_column='department_id', related_name='approvalchains_department_id')
    category = models.CharField(max_length=80, null=True, blank=True)
    min_amount = models.FloatField()
    steps_json = models.TextField()
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='approvalchains_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'approval_chains'

class CatalogItems(DemstaModel):
    sku = models.CharField(max_length=64, db_index=True)
    label = models.CharField(max_length=200)
    kind = models.CharField(max_length=20, db_index=True)
    list_price = models.FloatField()
    currency = models.CharField(max_length=8)
    is_active = models.BooleanField(default=False)
    billable = models.BooleanField(default=False)
    category = models.ForeignKey('CatalogCategories', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='category_id', related_name='catalogitems_category_id')
    notes = models.TextField(null=True, blank=True)
    cdt_code = models.CharField(max_length=40, null=True, blank=True)
    tooth_required = models.BooleanField(default=False)
    ndc_code = models.CharField(max_length=40, null=True, blank=True)
    drug_schedule = models.CharField(max_length=20, null=True, blank=True)
    unit_of_measure = models.CharField(max_length=40, null=True, blank=True)
    vendor_fee_basis = models.CharField(max_length=80, null=True, blank=True)
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='inventory_item_id', related_name='catalogitems_inventory_item_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='catalogitems_clinic_id')
    class Meta:
        managed = False
        db_table = 'catalog_items'

class ConsentRecords(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='consentrecords_patient_id')
    procedure_name = models.CharField(max_length=200)
    version = models.IntegerField()
    signature_data = models.TextField(null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_by_name = models.CharField(max_length=200, null=True, blank=True)
    guardian = models.BooleanField(default=False)
    document_hash = models.CharField(max_length=128, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='consentrecords_clinic_id')
    class Meta:
        managed = False
        db_table = 'consent_records'

class EndoCases(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='endocases_patient_id')
    tooth_number = models.CharField(max_length=8, db_index=True)
    procedure_type = models.CharField(max_length=40)
    tooth_length_mm = models.FloatField(null=True, blank=True)
    canal_count = models.IntegerField(null=True, blank=True)
    working_length_mm = models.FloatField(null=True, blank=True)
    prep_method = models.CharField(max_length=40, null=True, blank=True)
    irrigants_json = models.TextField(null=True, blank=True)
    dressings_json = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=32, db_index=True)
    final_restoration = models.ForeignKey('Restorations', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='final_restoration_id', related_name='endocases_final_restoration_id')
    notes = models.TextField(null=True, blank=True)
    recorded_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='recorded_by_id', related_name='endocases_recorded_by_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='endocases_clinic_id')
    class Meta:
        managed = False
        db_table = 'endo_cases'

class Invoices(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='invoices_patient_id')
    invoice_number = models.CharField(max_length=40, db_index=True)
    status = models.CharField(max_length=32)
    issued_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    subtotal = models.FloatField()
    tax = models.FloatField()
    discount = models.FloatField()
    total = models.FloatField()
    amount_paid = models.FloatField()
    currency = models.CharField(max_length=8)
    notes = models.TextField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=64, null=True, blank=True, unique=True)
    amount_adjusted = models.FloatField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='invoices_clinic_id')
    class Meta:
        managed = False
        db_table = 'invoices'

class NotificationOutbox(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='patient_id', related_name='notificationoutbox_patient_id')
    channel = models.CharField(max_length=32, db_index=True)
    template_key = models.CharField(max_length=80, db_index=True)
    subject = models.CharField(max_length=300, null=True, blank=True)
    body = models.TextField()
    status = models.CharField(max_length=32, db_index=True)
    to_address = models.CharField(max_length=200, null=True, blank=True)
    scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)
    meta_json = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='created_by_id', related_name='notificationoutbox_created_by_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='notificationoutbox_clinic_id')
    class Meta:
        managed = False
        db_table = 'notification_outbox'

class Operatories(DemstaModel):
    department = models.ForeignKey('OrgDepartments', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='department_id', related_name='operatories_department_id')
    code = models.CharField(max_length=40)
    name = models.CharField(max_length=120)
    chair_number = models.IntegerField(null=True, blank=True)
    sort_order = models.IntegerField()
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='operatories_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'operatories'

class OrthoCases(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='orthocases_patient_id')
    clinician = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='clinician_id', related_name='orthocases_clinician_id')
    angle_class = models.CharField(max_length=16, null=True, blank=True)
    malocclusion_summary = models.TextField(null=True, blank=True)
    appliance_type = models.CharField(max_length=40)
    arch = models.CharField(max_length=16)
    bracket_system = models.CharField(max_length=80, null=True, blank=True)
    oral_hygiene = models.CharField(max_length=16, null=True, blank=True)
    status = models.CharField(max_length=32, db_index=True)
    started_on = models.DateField(null=True, blank=True)
    debonded_on = models.DateField(null=True, blank=True)
    planned_months = models.IntegerField()
    next_review_due = models.DateField(null=True, blank=True, db_index=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='orthocases_clinic_id')
    class Meta:
        managed = False
        db_table = 'ortho_cases'

class PaediatricProfiles(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='paediatricprofiles_patient_id')
    guardian_name = models.CharField(max_length=200, null=True, blank=True)
    guardian_phone = models.CharField(max_length=40, null=True, blank=True)
    guardian_relation = models.CharField(max_length=40, null=True, blank=True)
    behaviour_rating = models.IntegerField(null=True, blank=True)
    dentition_stage = models.CharField(max_length=16)
    caries_risk = models.CharField(max_length=16, db_index=True)
    oral_habits = models.TextField(null=True, blank=True)
    medical_alerts = models.TextField(null=True, blank=True)
    fluoride_last = models.DateField(null=True, blank=True)
    fluoride_next = models.DateField(null=True, blank=True, db_index=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='paediatricprofiles_clinic_id')
    class Meta:
        managed = False
        db_table = 'paediatric_profiles'

class PatientInsurancePlans(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='patientinsuranceplans_patient_id')
    payer_name = models.CharField(max_length=200)
    plan_name = models.CharField(max_length=200, null=True, blank=True)
    member_id = models.CharField(max_length=80, null=True, blank=True)
    group_number = models.CharField(max_length=80, null=True, blank=True)
    coverage_pct = models.FloatField()
    annual_max = models.FloatField(null=True, blank=True)
    lifetime_max = models.FloatField(null=True, blank=True)
    amount_used_ytd = models.FloatField()
    deductible = models.FloatField()
    deductible_met = models.FloatField()
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_primary = models.BooleanField(default=False)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='patientinsuranceplans_clinic_id')
    class Meta:
        managed = False
        db_table = 'patient_insurance_plans'

class PatientSafetyItems(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='patientsafetyitems_patient_id')
    kind = models.CharField(max_length=20)
    code = models.CharField(max_length=80)
    label = models.CharField(max_length=200)
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='patientsafetyitems_clinic_id')
    is_active = models.BooleanField(default=False)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by_id = models.CharField(max_length=36, null=True, blank=True)
    class Meta:
        managed = False
        db_table = 'patient_safety_items'

class PatientStatements(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='patientstatements_patient_id')
    statement_number = models.CharField(max_length=40, db_index=True)
    balance_due = models.FloatField()
    due_date = models.DateField(null=True, blank=True)
    issued_at = models.DateTimeField()
    notes = models.TextField(null=True, blank=True)
    invoice_ids = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='patientstatements_clinic_id')
    class Meta:
        managed = False
        db_table = 'patient_statements'

class PatientVitalSigns(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='patientvitalsigns_patient_id')
    recorded_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='recorded_by_id', related_name='patientvitalsigns_recorded_by_id')
    recorded_at = models.DateTimeField(db_index=True)
    bp_systolic = models.IntegerField(null=True, blank=True)
    bp_diastolic = models.IntegerField(null=True, blank=True)
    pulse = models.IntegerField(null=True, blank=True)
    temperature_c = models.FloatField(null=True, blank=True)
    spo2 = models.IntegerField(null=True, blank=True)
    respiratory_rate = models.IntegerField(null=True, blank=True)
    height_cm = models.FloatField(null=True, blank=True)
    weight_kg = models.FloatField(null=True, blank=True)
    posture = models.CharField(max_length=80, null=True, blank=True)
    gait = models.CharField(max_length=80, null=True, blank=True)
    appearance = models.CharField(max_length=80, null=True, blank=True)
    notes = models.CharField(max_length=400, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='patientvitalsigns_clinic_id')
    class Meta:
        managed = False
        db_table = 'patient_vital_signs'

class PerioExams(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='perioexams_patient_id')
    examiner = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='examiner_id', related_name='perioexams_examiner_id')
    exam_date = models.DateField(db_index=True)
    notes = models.TextField(null=True, blank=True)
    risk_band = models.CharField(max_length=20)
    suggested_recall_months = models.IntegerField()
    mean_pocket_depth = models.FloatField(null=True, blank=True)
    bleeding_pct = models.FloatField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='perioexams_clinic_id')
    class Meta:
        managed = False
        db_table = 'perio_exams'

class Prescriptions(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='prescriptions_patient_id')
    prescribed_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='prescribed_by_id', related_name='prescriptions_prescribed_by_id')
    status = models.CharField(max_length=32, db_index=True)
    notes = models.TextField(null=True, blank=True)
    prescribed_at = models.DateTimeField()
    rx_number = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    verified_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='verified_by_id', related_name='prescriptions_verified_by_id')
    verified_at = models.DateTimeField(null=True, blank=True)
    dispensed_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='dispensed_by_id', related_name='prescriptions_dispensed_by_id')
    dispensed_at = models.DateTimeField(null=True, blank=True)
    invoice = models.ForeignKey('Invoices', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='invoice_id', related_name='prescriptions_invoice_id')
    cancel_reason = models.CharField(max_length=300, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='prescriptions_clinic_id')
    class Meta:
        managed = False
        db_table = 'prescriptions'

class PurchaseOrderLines(DemstaModel):
    purchase_order = models.ForeignKey('PurchaseOrders', on_delete=models.CASCADE, db_index=True, db_column='purchase_order_id', related_name='purchaseorderlines_purchase_order_id')
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.CASCADE, db_index=True, db_column='inventory_item_id', related_name='purchaseorderlines_inventory_item_id')
    quantity_ordered = models.FloatField()
    quantity_received = models.FloatField()
    unit_cost = models.FloatField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'purchase_order_lines'

class RegistrationDrafts(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='patient_id', related_name='registrationdrafts_patient_id')
    created_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='created_by_id', related_name='registrationdrafts_created_by_id')
    updated_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='updated_by_id', related_name='registrationdrafts_updated_by_id')
    status = models.CharField(max_length=16, db_index=True)
    display_name = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, null=True, blank=True)
    step = models.IntegerField()
    payload_json = models.TextField()
    cancel_reason = models.CharField(max_length=300, null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='registrationdrafts_clinic_id')
    class Meta:
        managed = False
        db_table = 'registration_drafts'

class RequisitionLines(DemstaModel):
    requisition = models.ForeignKey('Requisitions', on_delete=models.CASCADE, db_index=True, db_column='requisition_id', related_name='requisitionlines_requisition_id')
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.CASCADE, db_index=True, db_column='inventory_item_id', related_name='requisitionlines_inventory_item_id')
    quantity_requested = models.FloatField()
    quantity_issued = models.FloatField()
    notes = models.CharField(max_length=200, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'requisition_lines'

class StockLots(DemstaModel):
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.CASCADE, db_index=True, db_column='inventory_item_id', related_name='stocklots_inventory_item_id')
    location = models.ForeignKey('StockLocations', on_delete=models.CASCADE, db_index=True, db_column='location_id', related_name='stocklots_location_id')
    lot_code = models.CharField(max_length=64)
    expiry_date = models.DateField(null=True, blank=True)
    quantity = models.FloatField()
    unit_cost = models.FloatField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='stocklots_clinic_id')
    class Meta:
        managed = False
        db_table = 'stock_lots'

class SurgicalCases(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='surgicalcases_patient_id')
    surgeon = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='surgeon_id', related_name='surgicalcases_surgeon_id')
    procedure_type = models.CharField(max_length=80)
    site = models.CharField(max_length=80, null=True, blank=True)
    diagnosis = models.TextField(null=True, blank=True)
    anaesthesia = models.CharField(max_length=32)
    asa_class = models.CharField(max_length=8, null=True, blank=True)
    status = models.CharField(max_length=32, db_index=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    performed_at = models.DateTimeField(null=True, blank=True)
    operative_notes = models.TextField(null=True, blank=True)
    complications = models.TextField(null=True, blank=True)
    histopathology = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='surgicalcases_clinic_id')
    class Meta:
        managed = False
        db_table = 'surgical_cases'

class TreatmentPlans(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='treatmentplans_patient_id')
    title = models.CharField(max_length=200)
    status = models.CharField(max_length=32, db_index=True)
    target_start_date = models.DateField(null=True, blank=True)
    target_end_date = models.DateField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by_name = models.CharField(max_length=200, null=True, blank=True)
    approval_notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='treatmentplans_clinic_id')
    class Meta:
        managed = False
        db_table = 'treatment_plans'

class Appointments(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='appointments_patient_id')
    dentist = models.ForeignKey('Users', on_delete=models.CASCADE, db_index=True, db_column='dentist_id', related_name='appointments_dentist_id')
    appointment_type = models.ForeignKey('AppointmentTypes', on_delete=models.SET_NULL, null=True, blank=True, db_column='appointment_type_id', related_name='appointments_appointment_type_id')
    chair_number = models.IntegerField(null=True, blank=True)
    operatory = models.ForeignKey('Operatories', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='operatory_id', related_name='appointments_operatory_id')
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField()
    status = models.CharField(max_length=32, db_index=True)
    reason = models.CharField(max_length=400, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    is_recurring = models.BooleanField(default=False)
    recurrence_rule = models.CharField(max_length=120, null=True, blank=True)
    waitlist = models.BooleanField(default=False)
    no_show = models.BooleanField(default=False)
    color = models.CharField(max_length=16, null=True, blank=True)
    queue_number = models.IntegerField(null=True, blank=True, db_index=True)
    service_name = models.CharField(max_length=200, null=True, blank=True)
    department = models.CharField(max_length=32, null=True, blank=True, db_index=True)
    is_appointment = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='appointments_clinic_id')
    class Meta:
        managed = False
        db_table = 'appointments'

class CatalogFeeRates(DemstaModel):
    catalog_item = models.ForeignKey('CatalogItems', on_delete=models.CASCADE, db_index=True, db_column='catalog_item_id', related_name='catalogfeerates_catalog_item_id')
    payer_name = models.CharField(max_length=200, db_index=True)
    amount = models.FloatField()
    effective_from = models.DateField()
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='catalogfeerates_clinic_id')
    class Meta:
        managed = False
        db_table = 'catalog_fee_rates'

class CatalogPriceHistory(DemstaModel):
    catalog_item = models.ForeignKey('CatalogItems', on_delete=models.CASCADE, db_index=True, db_column='catalog_item_id', related_name='catalogpricehistory_catalog_item_id')
    old_price = models.FloatField()
    new_price = models.FloatField()
    changed_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='changed_by_id', related_name='catalogpricehistory_changed_by_id')
    notes = models.CharField(max_length=200, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='catalogpricehistory_clinic_id')
    class Meta:
        managed = False
        db_table = 'catalog_price_history'

class DentalChartEntries(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='dentalchartentries_patient_id')
    tooth_number = models.CharField(max_length=8)
    surfaces = models.CharField(max_length=16, null=True, blank=True)
    notation = models.CharField(max_length=20)
    dentition = models.CharField(max_length=20)
    condition_code = models.CharField(max_length=40)
    condition_label = models.CharField(max_length=120)
    entry_kind = models.CharField(max_length=20)
    status = models.CharField(max_length=32)
    material = models.CharField(max_length=80, null=True, blank=True)
    shade = models.CharField(max_length=40, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    recorded_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='recorded_by_id', related_name='dentalchartentries_recorded_by_id')
    visit_date = models.DateField(null=True, blank=True)
    billed_invoice = models.ForeignKey('Invoices', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='billed_invoice_id', related_name='dentalchartentries_billed_invoice_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='dentalchartentries_clinic_id')
    class Meta:
        managed = False
        db_table = 'dental_chart_entries'

class EndoObturations(DemstaModel):
    endo_case = models.ForeignKey('EndoCases', on_delete=models.CASCADE, db_index=True, db_column='endo_case_id', related_name='endoobturations_endo_case_id')
    visit_date = models.DateField()
    canals_filled = models.CharField(max_length=120, null=True, blank=True)
    material = models.CharField(max_length=120, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'endo_obturations'

class FeeScheduleItems(DemstaModel):
    code = models.CharField(max_length=40, db_index=True)
    label = models.CharField(max_length=200)
    category = models.CharField(max_length=40)
    unit_price = models.FloatField()
    currency = models.CharField(max_length=8)
    is_active = models.BooleanField(default=False)
    billable = models.BooleanField(default=False)
    notes = models.TextField(null=True, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    fee_schedule = models.ForeignKey('FeeSchedules', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='fee_schedule_id', related_name='feescheduleitems_fee_schedule_id')
    catalog_item = models.ForeignKey('CatalogItems', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='catalog_item_id', related_name='feescheduleitems_catalog_item_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='feescheduleitems_clinic_id')
    class Meta:
        managed = False
        db_table = 'fee_schedule_items'

class InsuranceClaims(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='insuranceclaims_patient_id')
    invoice = models.ForeignKey('Invoices', on_delete=models.CASCADE, db_index=True, db_column='invoice_id', related_name='insuranceclaims_invoice_id')
    plan = models.ForeignKey('PatientInsurancePlans', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='plan_id', related_name='insuranceclaims_plan_id')
    claim_number = models.CharField(max_length=40, db_index=True)
    status = models.CharField(max_length=32, db_index=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    adjudicated_at = models.DateTimeField(null=True, blank=True)
    scrub_notes = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='insuranceclaims_clinic_id')
    class Meta:
        managed = False
        db_table = 'insurance_claims'

class OrthoAdjustments(DemstaModel):
    ortho_case = models.ForeignKey('OrthoCases', on_delete=models.CASCADE, db_index=True, db_column='ortho_case_id', related_name='orthoadjustments_ortho_case_id')
    visit_date = models.DateField()
    archwire = models.CharField(max_length=80, null=True, blank=True)
    procedures = models.TextField(null=True, blank=True)
    elastics = models.CharField(max_length=80, null=True, blank=True)
    next_visit_weeks = models.IntegerField()
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'ortho_adjustments'

class PaediatricTreatments(DemstaModel):
    profile = models.ForeignKey('PaediatricProfiles', on_delete=models.CASCADE, db_index=True, db_column='profile_id', related_name='paediatrictreatments_profile_id')
    treatment_type = models.CharField(max_length=40)
    tooth = models.CharField(max_length=8, null=True, blank=True)
    performed_on = models.DateField()
    performed_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='performed_by_id', related_name='paediatrictreatments_performed_by_id')
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'paediatric_treatments'

class Payments(DemstaModel):
    invoice = models.ForeignKey('Invoices', on_delete=models.CASCADE, db_index=True, db_column='invoice_id', related_name='payments_invoice_id')
    amount = models.FloatField()
    method = models.CharField(max_length=32)
    payer_type = models.CharField(max_length=24)
    insurer = models.CharField(max_length=80, null=True, blank=True)
    paid_at = models.DateTimeField()
    reference = models.CharField(max_length=120, null=True, blank=True)
    received_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='received_by_id', related_name='payments_received_by_id')
    idempotency_key = models.CharField(max_length=64, null=True, blank=True, unique=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='payments_clinic_id')
    class Meta:
        managed = False
        db_table = 'payments'

class PerioSites(DemstaModel):
    exam = models.ForeignKey('PerioExams', on_delete=models.CASCADE, db_index=True, db_column='exam_id', related_name='periosites_exam_id')
    tooth_number = models.CharField(max_length=8, db_index=True)
    site_code = models.CharField(max_length=8)
    pocket_depth_mm = models.IntegerField(null=True, blank=True)
    bleeding_on_probing = models.BooleanField(default=False)
    recession_mm = models.IntegerField(null=True, blank=True)
    plaque_index = models.FloatField(null=True, blank=True)
    gingival_index = models.FloatField(null=True, blank=True)
    mobility_grade = models.IntegerField(null=True, blank=True)
    furcation_grade = models.IntegerField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'perio_sites'

class PrescriptionItems(DemstaModel):
    prescription = models.ForeignKey('Prescriptions', on_delete=models.CASCADE, db_index=True, db_column='prescription_id', related_name='prescriptionitems_prescription_id')
    drug_name = models.CharField(max_length=200)
    dose = models.CharField(max_length=120)
    quantity = models.CharField(max_length=80)
    instructions = models.TextField(null=True, blank=True)
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='inventory_item_id', related_name='prescriptionitems_inventory_item_id')
    drug_template = models.ForeignKey('DrugTemplates', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='drug_template_id', related_name='prescriptionitems_drug_template_id')
    quantity_dispensed = models.FloatField()
    line_status = models.CharField(max_length=24)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'prescription_items'

class DispenseEvents(DemstaModel):
    prescription = models.ForeignKey('Prescriptions', on_delete=models.CASCADE, db_index=True, db_column='prescription_id', related_name='dispenseevents_prescription_id')
    prescription_item = models.ForeignKey('PrescriptionItems', on_delete=models.CASCADE, db_index=True, db_column='prescription_item_id', related_name='dispenseevents_prescription_item_id')
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='inventory_item_id', related_name='dispenseevents_inventory_item_id')
    quantity = models.FloatField()
    quantity_returned = models.FloatField()
    lot_code = models.CharField(max_length=64, null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    unit_price = models.FloatField()
    label_text = models.TextField(null=True, blank=True)
    invoice = models.ForeignKey('Invoices', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='invoice_id', related_name='dispenseevents_invoice_id')
    dispensed_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='dispensed_by_id', related_name='dispenseevents_dispensed_by_id')
    notes = models.CharField(max_length=300, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='dispenseevents_clinic_id')
    class Meta:
        managed = False
        db_table = 'dispense_events'

class StaffProfiles(DemstaModel):
    user = models.ForeignKey('Users', on_delete=models.CASCADE, db_index=True, db_column='user_id', related_name='staffprofiles_user_id')
    title = models.CharField(max_length=120, null=True, blank=True)
    specialty = models.CharField(max_length=120, null=True, blank=True)
    certifications_json = models.TextField(null=True, blank=True)
    department = models.CharField(max_length=80, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    cert_expires_at = models.DateField(null=True, blank=True)
    license_no = models.CharField(max_length=80, null=True, blank=True)
    is_scheduling_provider = models.BooleanField(default=False)
    default_operatory = models.ForeignKey('Operatories', on_delete=models.SET_NULL, null=True, blank=True, db_column='default_operatory_id', related_name='staffprofiles_default_operatory_id')
    production_goal = models.FloatField(null=True, blank=True)
    commission_rate_bps = models.IntegerField()
    schedule_json = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='staffprofiles_clinic_id')
    class Meta:
        managed = False
        db_table = 'staff_profiles'

class SurgicalFollowUps(DemstaModel):
    surgical_case = models.ForeignKey('SurgicalCases', on_delete=models.CASCADE, db_index=True, db_column='surgical_case_id', related_name='surgicalfollowups_surgical_case_id')
    visit_date = models.DateField()
    pain_score = models.IntegerField(null=True, blank=True)
    swelling = models.CharField(max_length=32, null=True, blank=True)
    healing = models.CharField(max_length=32)
    sutures_removed = models.BooleanField(default=False)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'surgical_follow_ups'

class TreatmentPlanItems(DemstaModel):
    treatment_plan = models.ForeignKey('TreatmentPlans', on_delete=models.CASCADE, db_index=True, db_column='treatment_plan_id', related_name='treatmentplanitems_treatment_plan_id')
    phase_name = models.CharField(max_length=120)
    phase_order = models.IntegerField()
    procedure_name = models.CharField(max_length=200)
    procedure_code = models.CharField(max_length=40, null=True, blank=True)
    icd10_code = models.CharField(max_length=16, null=True, blank=True, db_index=True)
    icd10_description = models.CharField(max_length=400, null=True, blank=True)
    tooth_number = models.CharField(max_length=8, null=True, blank=True)
    dependency_ref = models.CharField(max_length=120, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    estimated_fee = models.FloatField()
    insurance_coverage_pct = models.FloatField()
    insurance_estimate_amount = models.FloatField()
    patient_estimate_amount = models.FloatField()
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=32)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'treatment_plan_items'

class ClinicalNotes(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='clinicalnotes_patient_id')
    author = models.ForeignKey('Users', on_delete=models.CASCADE, db_index=True, db_column='author_id', related_name='clinicalnotes_author_id')
    appointment = models.ForeignKey('Appointments', on_delete=models.SET_NULL, null=True, blank=True, db_column='appointment_id', related_name='clinicalnotes_appointment_id')
    note_type = models.CharField(max_length=40)
    subjective = models.TextField(null=True, blank=True)
    objective = models.TextField(null=True, blank=True)
    assessment = models.TextField(null=True, blank=True)
    plan = models.TextField(null=True, blank=True)
    procedure_codes = models.CharField(max_length=200, null=True, blank=True)
    is_finalized = models.BooleanField(default=False)
    ai_draft = models.BooleanField(default=False)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='clinicalnotes_clinic_id')
    class Meta:
        managed = False
        db_table = 'clinical_notes'

class ClinicalVisits(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='clinicalvisits_patient_id')
    appointment = models.ForeignKey('Appointments', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='appointment_id', related_name='clinicalvisits_appointment_id')
    examiner = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='examiner_id', related_name='clinicalvisits_examiner_id')
    visit_date = models.DateField(db_index=True)
    status = models.CharField(max_length=32, db_index=True)
    chief_complaint = models.TextField(null=True, blank=True)
    vitals_json = models.TextField(null=True, blank=True)
    extra_oral_json = models.TextField(null=True, blank=True)
    intra_oral_json = models.TextField(null=True, blank=True)
    investigations_json = models.TextField(null=True, blank=True)
    diagnosis_json = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='clinicalvisits_clinic_id')
    class Meta:
        managed = False
        db_table = 'clinical_visits'

class InventoryUsages(DemstaModel):
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.CASCADE, db_index=True, db_column='inventory_item_id', related_name='inventoryusages_inventory_item_id')
    quantity = models.FloatField()
    restoration = models.ForeignKey('Restorations', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='restoration_id', related_name='inventoryusages_restoration_id')
    chart_entry = models.ForeignKey('DentalChartEntries', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='chart_entry_id', related_name='inventoryusages_chart_entry_id')
    recorded_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='recorded_by_id', related_name='inventoryusages_recorded_by_id')
    reason = models.CharField(max_length=200, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='inventoryusages_clinic_id')
    class Meta:
        managed = False
        db_table = 'inventory_usages'

class InvoiceLineItems(DemstaModel):
    invoice = models.ForeignKey('Invoices', on_delete=models.CASCADE, db_index=True, db_column='invoice_id', related_name='invoicelineitems_invoice_id')
    description = models.CharField(max_length=300)
    tooth_number = models.CharField(max_length=8, null=True, blank=True)
    quantity = models.IntegerField()
    unit_price = models.FloatField()
    total = models.FloatField()
    procedure_code = models.CharField(max_length=40, null=True, blank=True)
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='inventory_item_id', related_name='invoicelineitems_inventory_item_id')
    line_kind = models.CharField(max_length=20)
    chart_entry = models.ForeignKey('DentalChartEntries', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='chart_entry_id', related_name='invoicelineitems_chart_entry_id')
    provider = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='provider_id', related_name='invoicelineitems_provider_id')
    fee_charged = models.FloatField()
    estimated_insurance = models.FloatField()
    estimated_patient = models.FloatField()
    actual_insurance = models.FloatField()
    actual_patient = models.FloatField()
    charge_status = models.CharField(max_length=32, db_index=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'invoice_line_items'

class ClaimLineItems(DemstaModel):
    claim = models.ForeignKey('InsuranceClaims', on_delete=models.CASCADE, db_index=True, db_column='claim_id', related_name='claimlineitems_claim_id')
    line_item = models.ForeignKey('InvoiceLineItems', on_delete=models.CASCADE, db_index=True, db_column='line_item_id', related_name='claimlineitems_line_item_id')
    billed_amount = models.FloatField()
    allowed_amount = models.FloatField(null=True, blank=True)
    paid_amount = models.FloatField()
    patient_responsibility = models.FloatField()
    status = models.CharField(max_length=32, db_index=True)
    denial_reason = models.CharField(max_length=300, null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    class Meta:
        managed = False
        db_table = 'claim_line_items'

class ImagingStudies(DemstaModel):
    patient = models.ForeignKey('Patients', on_delete=models.CASCADE, db_index=True, db_column='patient_id', related_name='imagingstudies_patient_id')
    captured_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='captured_by_id', related_name='imagingstudies_captured_by_id')
    visit = models.ForeignKey('ClinicalVisits', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='visit_id', related_name='imagingstudies_visit_id')
    study_type = models.CharField(max_length=80)
    tooth = models.CharField(max_length=16, null=True, blank=True)
    captured_at = models.DateTimeField()
    storage_key = models.CharField(max_length=500, null=True, blank=True)
    content_type = models.CharField(max_length=120, null=True, blank=True)
    byte_size = models.IntegerField(null=True, blank=True)
    checksum_sha256 = models.CharField(max_length=64, null=True, blank=True)
    is_encrypted = models.BooleanField(default=False)
    original_filename = models.CharField(max_length=255, null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='imagingstudies_clinic_id')
    class Meta:
        managed = False
        db_table = 'imaging_studies'

class LedgerAdjustments(DemstaModel):
    invoice = models.ForeignKey('Invoices', on_delete=models.CASCADE, db_index=True, db_column='invoice_id', related_name='ledgeradjustments_invoice_id')
    line_item = models.ForeignKey('InvoiceLineItems', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='line_item_id', related_name='ledgeradjustments_line_item_id')
    amount = models.FloatField()
    kind = models.CharField(max_length=32)
    notes = models.TextField(null=True, blank=True)
    created_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='created_by_id', related_name='ledgeradjustments_created_by_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='ledgeradjustments_clinic_id')
    class Meta:
        managed = False
        db_table = 'ledger_adjustments'

class StockMovements(DemstaModel):
    inventory_item = models.ForeignKey('InventoryItems', on_delete=models.CASCADE, db_index=True, db_column='inventory_item_id', related_name='stockmovements_inventory_item_id')
    lot = models.ForeignKey('StockLots', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='lot_id', related_name='stockmovements_lot_id')
    from_location = models.ForeignKey('StockLocations', on_delete=models.SET_NULL, null=True, blank=True, db_column='from_location_id', related_name='stockmovements_from_location_id')
    to_location = models.ForeignKey('StockLocations', on_delete=models.SET_NULL, null=True, blank=True, db_column='to_location_id', related_name='stockmovements_to_location_id')
    movement_type = models.CharField(max_length=32, db_index=True)
    quantity = models.FloatField()
    unit_cost_snapshot = models.FloatField()
    reason = models.CharField(max_length=200, null=True, blank=True)
    supplier = models.ForeignKey('Suppliers', on_delete=models.SET_NULL, null=True, blank=True, db_column='supplier_id', related_name='stockmovements_supplier_id')
    purchase_order = models.ForeignKey('PurchaseOrders', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='purchase_order_id', related_name='stockmovements_purchase_order_id')
    invoice = models.ForeignKey('Invoices', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='invoice_id', related_name='stockmovements_invoice_id')
    invoice_line = models.ForeignKey('InvoiceLineItems', on_delete=models.SET_NULL, null=True, blank=True, db_column='invoice_line_id', related_name='stockmovements_invoice_line_id')
    prescription = models.ForeignKey('Prescriptions', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='prescription_id', related_name='stockmovements_prescription_id')
    requisition = models.ForeignKey('Requisitions', on_delete=models.SET_NULL, null=True, blank=True, db_index=True, db_column='requisition_id', related_name='stockmovements_requisition_id')
    recorded_by = models.ForeignKey('Users', on_delete=models.SET_NULL, null=True, blank=True, db_column='recorded_by_id', related_name='stockmovements_recorded_by_id')
    id = models.CharField(max_length=36, primary_key=True, editable=False)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    clinic = models.ForeignKey('Clinics', on_delete=models.CASCADE, db_index=True, db_column='clinic_id', related_name='stockmovements_clinic_id')
    class Meta:
        managed = False
        db_table = 'stock_movements'

