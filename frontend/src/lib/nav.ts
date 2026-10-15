import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Baby,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  ArrowLeftRight,
  Truck,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  Package,
  PenLine,
  Pill,
  Receipt,
  Scan,
  Settings2,
  Slice,
  Smile,
  Sparkles,
  Stethoscope,
  UserPlus,
  Users,
  UserRoundCog,
  BarChart3,
  Braces,
} from "lucide-react";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles?: string[];
  anyPermission?: string[];
  omitFromMobile?: boolean;
};

export type NavGroup = {
  labelKey: string;
  icon: LucideIcon;
  roles?: string[];
  anyPermission?: string[];
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const CLINICAL_ROLES = ["dentist", "hygienist", "clinic_admin", "super_admin"];
const FRONT_DESK_ROLES = ["receptionist", "clinic_admin", "super_admin"];
const WAREHOUSE_ROLES = ["clinic_admin", "dentist", "super_admin", "pharmacy", "accountant", "hygienist"];
const WAREHOUSE_PERMS = ["inventory:read", "inventory:issue", "inventory:*"];
const REQUISITION_ROLES = [
  "dentist",
  "hygienist",
  "nurse",
  "receptionist",
  "pharmacy",
  "lab_tech",
  "clinic_admin",
  "super_admin",
];
const REQUISITION_PERMS = ["requisition:create", "requisition:approve", "requisition:fulfill", "requisition:*"];
const REQUISITION_ITEM: NavItem = {
  to: "/requisitions",
  labelKey: "requisitions",
  icon: ClipboardList,
  roles: REQUISITION_ROLES,
  anyPermission: REQUISITION_PERMS,
};

const WAREHOUSE_GROUP: NavGroup = {
  labelKey: "inventory",
  icon: Package,
  roles: WAREHOUSE_ROLES,
  anyPermission: WAREHOUSE_PERMS,
  children: [
    { to: "/inventory", labelKey: "whOverview", icon: LayoutDashboard, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=requests", labelKey: "whRequests", icon: ClipboardList, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=stock", labelKey: "whStock", icon: Package, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=receive", labelKey: "whReceive", icon: Truck, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=issues", labelKey: "whIssues", icon: ArrowLeftRight, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=orders", labelKey: "whOrders", icon: ClipboardList, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=suppliers", labelKey: "whSuppliers", icon: Building2, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=movements", labelKey: "whMovements", icon: ClipboardPlus, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=analysis", labelKey: "whAnalysis", icon: BarChart3, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
    { to: "/inventory?view=fees", labelKey: "whFees", icon: Receipt, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
  ],
};

const FRONT_DESK_GROUP: NavGroup = {
  labelKey: "frontDesk",
  icon: ClipboardPlus,
  roles: FRONT_DESK_ROLES,
  anyPermission: ["patients:read", "appointments:read"],
  children: [
    {
      to: "/front-desk",
      labelKey: "frontDeskToday",
      icon: ClipboardPlus,
      roles: FRONT_DESK_ROLES,
      anyPermission: ["patients:read", "appointments:read"],
    },
    {
      to: "/front-desk/register?step=0",
      labelKey: "regParticulars",
      icon: UserPlus,
      roles: FRONT_DESK_ROLES,
      anyPermission: ["patients:*"],
    },
    {
      to: "/front-desk/register?step=1",
      labelKey: "regItems",
      icon: Package,
      roles: FRONT_DESK_ROLES,
      anyPermission: ["patients:*"],
      omitFromMobile: true,
    },
    {
      to: "/front-desk/register?step=2",
      labelKey: "regPayment",
      icon: Receipt,
      roles: FRONT_DESK_ROLES,
      anyPermission: ["patients:*"],
      omitFromMobile: true,
    },
    {
      to: "/front-desk/register?step=3",
      labelKey: "regService",
      icon: CalendarDays,
      roles: FRONT_DESK_ROLES,
      anyPermission: ["patients:*"],
      omitFromMobile: true,
    },
    {
      to: "/front-desk/register?step=4",
      labelKey: "regConsent",
      icon: PenLine,
      roles: FRONT_DESK_ROLES,
      anyPermission: ["patients:*"],
      omitFromMobile: true,
    },
    {
      to: "/front-desk/register?step=5",
      labelKey: "regFinalize",
      icon: CheckCircle2,
      roles: FRONT_DESK_ROLES,
      anyPermission: ["patients:*"],
      omitFromMobile: true,
    },
  ],
};

/** One Clinical dropdown — four departments, each with full clerkship + specialty work. */
const CLINICAL_GROUP: NavGroup = {
  labelKey: "clinical",
  icon: Stethoscope,
  roles: CLINICAL_ROLES,
  anyPermission: ["clinical:read", "clinical:*"],
  children: [
    {
      to: "/clinical/restorative",
      labelKey: "restorative",
      icon: Smile,
      roles: CLINICAL_ROLES,
      anyPermission: ["clinical:read", "clinical:*"],
    },
    {
      to: "/clinical/maxillofacial",
      labelKey: "maxillofacial",
      icon: Slice,
      roles: CLINICAL_ROLES,
      anyPermission: ["clinical:read", "clinical:*"],
    },
    {
      to: "/clinical/orthodontic",
      labelKey: "orthodontic",
      icon: Braces,
      roles: CLINICAL_ROLES,
      anyPermission: ["clinical:read", "clinical:*"],
    },
    {
      to: "/clinical/paediatric",
      labelKey: "paediatric",
      icon: Baby,
      roles: CLINICAL_ROLES,
      anyPermission: ["clinical:read", "clinical:*"],
    },
  ],
};

const ALL: NavEntry[] = [
  {
    to: "/owner",
    labelKey: "owner",
    icon: Building2,
    roles: ["super_admin"],
  },
  {
    to: "/admin",
    labelKey: "clinicAdmin",
    icon: Settings2,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*"],
  },
  FRONT_DESK_GROUP,
  {
    to: "/vitals",
    labelKey: "vitals",
    icon: Activity,
    roles: ["nurse", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["clinical:vitals", "clinical:*"],
  },
  CLINICAL_GROUP,
  {
    to: "/clinical-records",
    labelKey: "clinicalRecords",
    icon: FolderOpen,
    roles: CLINICAL_ROLES,
    anyPermission: ["clinical:read", "clinical:*"],
  },
  {
    to: "/hygiene",
    labelKey: "hygiene",
    icon: UserRoundCog,
    roles: ["hygienist", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["clinical:read", "clinical:limited"],
  },
  {
    to: "/imaging",
    labelKey: "imaging",
    icon: Scan,
    roles: ["imaging_tech", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["imaging:read", "imaging:*"],
  },
  {
    to: "/lab",
    labelKey: "lab",
    icon: FlaskConical,
    roles: ["lab_tech", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["lab:read", "lab:*"],
  },
  {
    to: "/pharmacy",
    labelKey: "pharmacy",
    icon: Pill,
    roles: ["pharmacy", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["pharmacy:read", "pharmacy:*"],
  },
  REQUISITION_ITEM,
  WAREHOUSE_GROUP,
  {
    to: "/patients",
    labelKey: "patients",
    icon: Users,
    roles: [
      "super_admin",
      "clinic_admin",
      "dentist",
      "hygienist",
      "receptionist",
      "lab_tech",
      "pharmacy",
      "imaging_tech",
    ],
    anyPermission: ["patients:read", "patients:*"],
  },
  {
    to: "/schedule",
    labelKey: "schedule",
    icon: CalendarDays,
    roles: [
      "super_admin",
      "clinic_admin",
      "dentist",
      "hygienist",
      "receptionist",
    ],
    anyPermission: ["appointments:read", "appointments:*"],
  },
  {
    to: "/billing",
    labelKey: "billing",
    icon: Receipt,
    roles: ["super_admin", "clinic_admin", "receptionist", "accountant", "dentist"],
    anyPermission: ["billing:read", "billing:create", "billing:*"],
  },
  {
    to: "/ai",
    labelKey: "aiAssist",
    icon: Sparkles,
    roles: ["super_admin", "clinic_admin", "dentist", "hygienist", "receptionist"],
    anyPermission: ["ai:suggest", "ai:*"],
  },
  {
    to: "/reports",
    labelKey: "reports",
    icon: BarChart3,
    roles: ["super_admin", "clinic_admin", "accountant", "dentist"],
    anyPermission: ["reports:own", "reports:financial", "reports:*"],
  },
  {
    to: "/dashboard/modules",
    labelKey: "dashboard",
    icon: LayoutDashboard,
  },
];

const ADMIN_ITEMS: NavItem[] = [
  {
    to: "/admin",
    labelKey: "adminOrg",
    icon: Building2,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*", "config:clinic", "config:*"],
  },
  {
    to: "/admin?view=staff",
    labelKey: "adminUsers",
    icon: Users,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*"],
  },
  {
    to: "/admin?view=roles",
    labelKey: "adminRoles",
    icon: UserRoundCog,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*"],
  },
  {
    to: "/admin?view=clinical",
    labelKey: "adminClinical",
    icon: Stethoscope,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*", "config:clinic", "config:*"],
  },
  {
    to: "/admin?view=fees",
    labelKey: "adminFees",
    icon: ClipboardPlus,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*", "config:clinic", "config:*", "billing:*"],
  },
  {
    to: "/admin?view=templates",
    labelKey: "adminTemplates",
    icon: PenLine,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*", "config:clinic", "config:*"],
  },
  {
    to: "/admin?view=ops",
    labelKey: "adminOps",
    icon: Settings2,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*"],
  },
];

export type ModuleNav = {
  key: string;
  titleKey: string;
  home: string;
  /** In-module destinations — flat links and expandable groups. */
  entries: NavEntry[];
};

type ModuleDef = {
  key: string;
  titleKey: string;
  home: string;
  match: (path: string) => boolean;
  entries: NavEntry[];
};

function singletonModule(
  key: string,
  titleKey: string,
  home: string,
  item: NavItem,
): ModuleDef {
  return {
    key,
    titleKey,
    home,
    match: (path) => path === home || path.startsWith(`${home}/`),
    entries: [item],
  };
}

/** In-module destinations only — never the full module catalog. */
const MODULE_DEFS: ModuleDef[] = [
  singletonModule("owner", "owner", "/owner", {
    to: "/owner",
    labelKey: "owner",
    icon: Building2,
    roles: ["super_admin"],
  }),
  {
    key: "admin",
    titleKey: "clinicAdmin",
    home: "/admin",
    match: (path) => path === "/admin" || path.startsWith("/admin/"),
    entries: [
      ADMIN_ITEMS[0]!,
      {
        labelKey: "adminPeople",
        icon: Users,
        roles: ["clinic_admin", "super_admin"],
        anyPermission: ["staff:*"],
        children: ADMIN_ITEMS.filter((item) => item.to.includes("staff") || item.to.includes("roles")),
      },
      {
        labelKey: "adminSetup",
        icon: Settings2,
        roles: ["clinic_admin", "super_admin"],
        anyPermission: ["staff:*", "config:clinic", "config:*", "billing:*"],
        children: ADMIN_ITEMS.filter((item) =>
          ["clinical", "fees", "templates", "ops"].some((view) => item.to.includes(`view=${view}`)),
        ),
      },
    ],
  },
  {
    key: "front-desk",
    titleKey: "frontDesk",
    home: "/front-desk",
    match: (path) => path === "/front-desk" || path.startsWith("/front-desk/"),
    entries: [
      FRONT_DESK_GROUP.children[0]!,
      {
        labelKey: "registration",
        icon: UserPlus,
        roles: FRONT_DESK_ROLES,
        anyPermission: ["patients:*"],
        children: FRONT_DESK_GROUP.children.slice(1),
      },
    ],
  },
  singletonModule("vitals", "vitals", "/vitals", {
    to: "/vitals",
    labelKey: "vitals",
    icon: Activity,
    roles: ["nurse", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["clinical:vitals", "clinical:*"],
  }),
  {
    key: "clinical",
    titleKey: "clinical",
    home: "/clinical/restorative",
    match: (path) => path === "/clinical" || path.startsWith("/clinical/"),
    entries: [
      {
        labelKey: "clinicalDepts",
        icon: Stethoscope,
        roles: CLINICAL_ROLES,
        anyPermission: ["clinical:read", "clinical:*"],
        children: CLINICAL_GROUP.children,
      },
    ],
  },
  singletonModule("clinical-records", "clinicalRecords", "/clinical-records", {
    to: "/clinical-records",
    labelKey: "clinicalRecords",
    icon: FolderOpen,
    roles: CLINICAL_ROLES,
    anyPermission: ["clinical:read", "clinical:*"],
  }),
  singletonModule("hygiene", "hygiene", "/hygiene", {
    to: "/hygiene",
    labelKey: "hygiene",
    icon: UserRoundCog,
    roles: ["hygienist", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["clinical:read", "clinical:limited"],
  }),
  singletonModule("imaging", "imaging", "/imaging", {
    to: "/imaging",
    labelKey: "imaging",
    icon: Scan,
    roles: ["imaging_tech", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["imaging:read", "imaging:*"],
  }),
  singletonModule("lab", "lab", "/lab", {
    to: "/lab",
    labelKey: "lab",
    icon: FlaskConical,
    roles: ["lab_tech", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["lab:read", "lab:*"],
  }),
  singletonModule("pharmacy", "pharmacy", "/pharmacy", {
    to: "/pharmacy",
    labelKey: "pharmacy",
    icon: Pill,
    roles: ["pharmacy", "dentist", "clinic_admin", "super_admin"],
    anyPermission: ["pharmacy:read", "pharmacy:*"],
  }),
  singletonModule("requisitions", "requisitions", "/requisitions", REQUISITION_ITEM),
  {
    key: "inventory",
    titleKey: "inventory",
    home: "/inventory",
    match: (path) => path === "/inventory" || path.startsWith("/inventory/"),
    entries: [
      WAREHOUSE_GROUP.children[0]!,
      WAREHOUSE_GROUP.children[1]!,
      {
        labelKey: "whStockFlow",
        icon: Package,
        roles: WAREHOUSE_ROLES,
        anyPermission: WAREHOUSE_PERMS,
        children: WAREHOUSE_GROUP.children.filter((item) =>
          ["stock", "receive", "issues", "movements"].some((view) => item.to.includes(`view=${view}`)),
        ),
      },
      {
        labelKey: "whBuying",
        icon: Truck,
        roles: WAREHOUSE_ROLES,
        anyPermission: WAREHOUSE_PERMS,
        children: WAREHOUSE_GROUP.children.filter((item) =>
          ["orders", "suppliers", "fees"].some((view) => item.to.includes(`view=${view}`)),
        ),
      },
      WAREHOUSE_GROUP.children.find((item) => item.to.includes("view=analysis"))!,
    ],
  },
  singletonModule("patients", "patients", "/patients", {
    to: "/patients",
    labelKey: "patients",
    icon: Users,
    roles: [
      "super_admin",
      "clinic_admin",
      "dentist",
      "hygienist",
      "receptionist",
      "lab_tech",
      "pharmacy",
      "imaging_tech",
    ],
    anyPermission: ["patients:read", "patients:*"],
  }),
  singletonModule("schedule", "schedule", "/schedule", {
    to: "/schedule",
    labelKey: "schedule",
    icon: CalendarDays,
    roles: ["super_admin", "clinic_admin", "dentist", "hygienist", "receptionist"],
    anyPermission: ["appointments:read", "appointments:*"],
  }),
  {
    key: "billing",
    titleKey: "billing",
    home: "/billing",
    match: (path) => path === "/billing" || path.startsWith("/billing/"),
    entries: [
      {
        to: "/billing",
        labelKey: "billOverview",
        icon: LayoutDashboard,
        roles: ["super_admin", "clinic_admin", "receptionist", "accountant", "dentist"],
        anyPermission: ["billing:read", "billing:create", "billing:*"],
      },
      {
        to: "/billing/invoices",
        labelKey: "billInvoices",
        icon: Receipt,
        roles: ["super_admin", "clinic_admin", "receptionist", "accountant", "dentist"],
        anyPermission: ["billing:read", "billing:create", "billing:*"],
      },
      {
        to: "/billing/payments",
        labelKey: "billPayments",
        icon: ClipboardPlus,
        roles: ["super_admin", "clinic_admin", "receptionist", "accountant", "dentist"],
        anyPermission: ["billing:read", "billing:create", "billing:*"],
      },
      {
        to: "/billing/notifications",
        labelKey: "billNotifications",
        icon: ClipboardList,
        roles: ["super_admin", "clinic_admin", "receptionist", "accountant", "dentist"],
        anyPermission: ["billing:read", "billing:create", "billing:*"],
      },
    ],
  },
  singletonModule("ai", "aiAssist", "/ai", {
    to: "/ai",
    labelKey: "aiAssist",
    icon: Sparkles,
    roles: ["super_admin", "clinic_admin", "dentist", "hygienist", "receptionist"],
    anyPermission: ["ai:suggest", "ai:*"],
  }),
  {
    key: "reports",
    titleKey: "reports",
    home: "/reports",
    match: (path) => path === "/reports" || path.startsWith("/reports/"),
    entries: [
      {
        to: "/reports",
        labelKey: "rptOverview",
        icon: LayoutDashboard,
        roles: ["super_admin", "clinic_admin", "accountant", "dentist"],
        anyPermission: ["reports:own", "reports:financial", "reports:*"],
      },
      {
        to: "/reports?view=financial",
        labelKey: "rptFinancial",
        icon: Receipt,
        roles: ["super_admin", "clinic_admin", "accountant"],
        anyPermission: ["reports:financial", "reports:*"],
      },
      {
        to: "/reports?view=clinical",
        labelKey: "rptClinical",
        icon: Stethoscope,
        roles: ["super_admin", "clinic_admin", "accountant", "dentist"],
        anyPermission: ["reports:own", "reports:financial", "reports:*"],
      },
      {
        to: "/reports?view=operational",
        labelKey: "rptOperational",
        icon: ClipboardList,
        roles: ["super_admin", "clinic_admin", "accountant"],
        anyPermission: ["reports:*", "reports:financial"],
      },
    ],
  },
];

function roleAllows(roles: string[] | undefined, role: string | undefined | null): boolean {
  if (!roles) return true;
  if (!role) return false;
  return roles.includes(role);
}

export function hasEffectivePermission(
  granted: string[] | undefined | null,
  permission: string,
): boolean {
  if (!granted?.length) return false;
  if (granted.includes("*") || granted.includes(permission)) return true;
  const resource = permission.split(":")[0];
  return granted.includes(`${resource}:*`);
}

function itemVisible(
  item: { roles?: string[]; anyPermission?: string[] },
  role: string | undefined | null,
  permissions?: string[] | null,
): boolean {
  if (permissions?.length && item.anyPermission?.length) {
    return item.anyPermission.some((perm) => hasEffectivePermission(permissions, perm));
  }
  return roleAllows(item.roles, role);
}

function filterEntries(
  entries: NavEntry[],
  role: string | undefined | null,
  permissions?: string[] | null,
): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      const children = entry.children.filter((child) => itemVisible(child, role, permissions));
      if (children.length > 0) out.push({ ...entry, children });
    } else if (itemVisible(entry, role, permissions)) {
      out.push(entry);
    }
  }
  return out;
}

export function navForRole(
  role: string | undefined | null,
  permissions?: string[] | null,
): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const entry of ALL) {
    if (isNavGroup(entry)) {
      const children = entry.children.filter((child) => itemVisible(child, role, permissions));
      if (children.length > 0) entries.push({ ...entry, children });
    } else if (itemVisible(entry, role, permissions)) {
      entries.push(entry);
    }
  }
  return entries;
}

/** Flat list (dropdown children inlined) — path guards. */
export function flatNavForRole(
  role: string | undefined | null,
  permissions?: string[] | null,
): NavItem[] {
  return navForRole(role, permissions).flatMap((entry) => {
    if (!isNavGroup(entry)) return [entry];
    return entry.children.filter((c) => !c.omitFromMobile);
  });
}

/** Sidebar links for the module the user is currently in. Null on the modules dashboard. */
export function moduleNavForPath(
  path: string,
  role: string | undefined | null,
  permissions?: string[] | null,
): ModuleNav | null {
  const clean = path.split("?")[0];
  if (clean === MODULES_DASHBOARD_PATH || clean.startsWith(`${MODULES_DASHBOARD_PATH}/`)) {
    return null;
  }
  const def = MODULE_DEFS.find((mod) => mod.match(clean));
  if (!def) return null;
  const entries = filterEntries(def.entries, role, permissions);
  if (!entries.length) return null;
  return {
    key: def.key,
    titleKey: def.titleKey,
    home: def.home,
    entries,
  };
}

/** True when the current route is the permissioned modules home (no module sidebar). */
export function isModulesDashboardPath(path: string): boolean {
  const clean = path.split("?")[0];
  return clean === MODULES_DASHBOARD_PATH || clean.startsWith(`${MODULES_DASHBOARD_PATH}/`);
}

export const MODULES_DASHBOARD_PATH = "/dashboard/modules";

/** Every staff role lands on the modules dashboard. Do not branch on role name. */
export function roleHomePath(_role?: string | undefined | null): string {
  return MODULES_DASHBOARD_PATH;
}

export function roleHomeLabel(role: string | undefined | null): string {
  switch (role) {
    case "dentist":
      return "Clinical";
    case "hygienist":
      return "Hygiene bay";
    case "nurse":
      return "Vital signs";
    case "receptionist":
      return "Front desk";
    case "accountant":
      return "Revenue desk";
    case "lab_tech":
      return "Lab journey";
    case "pharmacy":
      return "Pharmacy";
    case "imaging_tech":
      return "Imaging suite";
    case "clinic_admin":
      return "Clinic admin";
    case "super_admin":
      return "System owner";
    default:
      return "Workspace";
  }
}

export function canAccessPath(
  role: string | undefined | null,
  path: string,
  permissions?: string[] | null,
): boolean {
  const clean = path.split("?")[0];
  const flat = ALL.flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
  const item =
    flat.find((n) => n.to.split("?")[0] === clean) ||
    flat.find((n) => {
      const base = n.to.split("?")[0];
      return base !== "/" && clean.startsWith(base + "/");
    });
  if (!item) return true;
  return itemVisible(item, role, permissions);
}

export type Crumb = { to: string; labelKey: string };

/** Real destinations only — labels come from existing nav entries. */
export function breadcrumbFor(
  pathname: string,
  search: string,
  role: string | undefined | null,
  permissions?: string[] | null,
): Crumb[] {
  const home: Crumb = { to: MODULES_DASHBOARD_PATH, labelKey: "dashboard" };
  if (pathname === MODULES_DASHBOARD_PATH) return [home];

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const crumbs: Crumb[] = [home, { to: "/admin", labelKey: "clinicAdmin" }];
    const view = new URLSearchParams(search).get("view");
    const sub = view ? ADMIN_ITEMS.find((item) => item.to === `/admin?view=${view}`) : undefined;
    if (sub) crumbs.push({ to: sub.to, labelKey: sub.labelKey });
    return crumbs;
  }

  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    const crumbs: Crumb[] = [home, { to: "/reports", labelKey: "reports" }];
    const view = new URLSearchParams(search).get("view");
    const reportMod = MODULE_DEFS.find((mod) => mod.key === "reports");
    const flat = (reportMod?.entries || []).flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
    const sub = view ? flat.find((item) => item.to === `/reports?view=${view}`) : undefined;
    if (sub) crumbs.push({ to: sub.to, labelKey: sub.labelKey });
    return crumbs;
  }

  if (pathname === "/billing" || pathname.startsWith("/billing/")) {
    const billingMod = MODULE_DEFS.find((mod) => mod.key === "billing");
    const crumbs: Crumb[] = [home, { to: "/billing", labelKey: "billing" }];
    const here = pathname === "/billing" ? "/billing" : pathname;
    const flat = (billingMod?.entries || []).flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
    const sub = flat.find((item) => item.to === here && item.to !== "/billing");
    if (sub) crumbs.push({ to: sub.to, labelKey: sub.labelKey });
    return crumbs;
  }

  if (pathname.startsWith("/clinical/")) {
    const crumbs: Crumb[] = [home, { to: "/clinical/restorative", labelKey: "clinical" }];
    const dept = CLINICAL_GROUP.children.find((item) => item.to === pathname);
    if (dept) crumbs.push({ to: dept.to, labelKey: dept.labelKey });
    return crumbs;
  }

  const here = search && search !== "?" ? `${pathname}${search}` : pathname;
  const entries = navForRole(role, permissions);
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      const exact = entry.children.find((item) => item.to === here);
      const pathOnly = entry.children.find((item) => item.to === pathname);
      const match = exact || pathOnly;
      if (!match) continue;
      const crumbs: Crumb[] = [home, { to: entry.children[0]?.to || pathname, labelKey: entry.labelKey }];
      if (match.to !== crumbs[1]?.to) crumbs.push({ to: match.to, labelKey: match.labelKey });
      return crumbs;
    }
    const base = entry.to.split("?")[0];
    if (base === pathname || (base !== "/" && pathname.startsWith(`${base}/`))) {
      const crumbs: Crumb[] = [home, { to: base, labelKey: entry.labelKey }];
      if (pathname.startsWith("/patients/") && pathname !== "/patients") {
        crumbs.push({ to: pathname, labelKey: "chart" });
      }
      return crumbs;
    }
  }

  if (pathname.startsWith("/patients/")) {
    return [home, { to: "/patients", labelKey: "patients" }, { to: pathname, labelKey: "chart" }];
  }
  return [home];
}
