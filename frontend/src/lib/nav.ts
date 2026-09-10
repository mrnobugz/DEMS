import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  ArrowLeftRight,
  Truck,
  FlaskConical,
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

const WAREHOUSE_GROUP: NavGroup = {
  labelKey: "inventory",
  icon: Package,
  roles: WAREHOUSE_ROLES,
  anyPermission: WAREHOUSE_PERMS,
  children: [
    { to: "/inventory", labelKey: "whOverview", icon: LayoutDashboard, roles: WAREHOUSE_ROLES, anyPermission: WAREHOUSE_PERMS },
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
  CLINICAL_GROUP,
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
    to: "/admin?view=procedures",
    labelKey: "adminProcedures",
    icon: ClipboardPlus,
    roles: ["clinic_admin", "super_admin"],
    anyPermission: ["staff:*"],
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
  items: NavItem[];
};

type ModuleDef = {
  key: string;
  titleKey: string;
  home: string;
  match: (path: string) => boolean;
  items: NavItem[];
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
    items: [item],
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
    items: ADMIN_ITEMS,
  },
  {
    key: "front-desk",
    titleKey: "frontDesk",
    home: "/front-desk",
    match: (path) => path === "/front-desk" || path.startsWith("/front-desk/"),
    items: FRONT_DESK_GROUP.children,
  },
  ...CLINICAL_GROUP.children.map((item) => {
    const home = item.to.split("?")[0];
    return singletonModule(home.replace("/clinical/", ""), item.labelKey, home, item);
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
  {
    key: "inventory",
    titleKey: "inventory",
    home: "/inventory",
    match: (path) => path === "/inventory" || path.startsWith("/inventory/"),
    items: WAREHOUSE_GROUP.children,
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
  singletonModule("billing", "billing", "/billing", {
    to: "/billing",
    labelKey: "billing",
    icon: Receipt,
    roles: ["super_admin", "clinic_admin", "receptionist", "accountant", "dentist"],
    anyPermission: ["billing:read", "billing:create", "billing:*"],
  }),
  singletonModule("ai", "aiAssist", "/ai", {
    to: "/ai",
    labelKey: "aiAssist",
    icon: Sparkles,
    roles: ["super_admin", "clinic_admin", "dentist", "hygienist", "receptionist"],
    anyPermission: ["ai:suggest", "ai:*"],
  }),
  singletonModule("reports", "reports", "/reports", {
    to: "/reports",
    labelKey: "reports",
    icon: BarChart3,
    roles: ["super_admin", "clinic_admin", "accountant", "dentist"],
    anyPermission: ["reports:own", "reports:financial", "reports:*"],
  }),
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
  return {
    key: def.key,
    titleKey: def.titleKey,
    home: def.home,
    items: def.items.filter((item) => itemVisible(item, role, permissions)),
  };
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
