import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Building2,
  CalendarDays,
  ClipboardPlus,
  FlaskConical,
  Hospital,
  LayoutDashboard,
  Package,
  Pill,
  Receipt,
  Scan,
  Settings2,
  Slice,
  Smile,
  Sparkles,
  Stethoscope,
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
};

export type NavGroup = {
  labelKey: string;
  icon: LucideIcon;
  roles?: string[];
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

const CLINIC_DEPARTMENT_ROLES = ["dentist", "hygienist", "clinic_admin", "super_admin"];

/** The four specialty departments, grouped under the Clinic dropdown. */
const CLINIC_GROUP: NavGroup = {
  labelKey: "clinic",
  icon: Hospital,
  roles: CLINIC_DEPARTMENT_ROLES,
  children: [
    {
      to: "/clinic/restorative",
      labelKey: "restorative",
      icon: Smile,
      roles: CLINIC_DEPARTMENT_ROLES,
    },
    {
      to: "/clinic/maxillofacial",
      labelKey: "maxillofacial",
      icon: Slice,
      roles: CLINIC_DEPARTMENT_ROLES,
    },
    {
      to: "/clinic/orthodontic",
      labelKey: "orthodontic",
      icon: Braces,
      roles: CLINIC_DEPARTMENT_ROLES,
    },
    {
      to: "/clinic/paediatric",
      labelKey: "paediatric",
      icon: Baby,
      roles: CLINIC_DEPARTMENT_ROLES,
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
  },
  {
    to: "/front-desk",
    labelKey: "frontDesk",
    icon: ClipboardPlus,
    roles: ["receptionist", "clinic_admin", "super_admin"],
  },
  {
    to: "/clinical",
    labelKey: "clinical",
    icon: Stethoscope,
    roles: ["dentist", "clinic_admin", "super_admin"],
  },
  CLINIC_GROUP,
  {
    to: "/hygiene",
    labelKey: "hygiene",
    icon: UserRoundCog,
    roles: ["hygienist", "dentist", "clinic_admin", "super_admin"],
  },
  {
    to: "/imaging",
    labelKey: "imaging",
    icon: Scan,
    roles: ["imaging_tech", "dentist", "clinic_admin", "super_admin"],
  },
  {
    to: "/lab",
    labelKey: "lab",
    icon: FlaskConical,
    roles: ["lab_tech", "dentist", "clinic_admin", "super_admin"],
  },
  {
    to: "/pharmacy",
    labelKey: "pharmacy",
    icon: Pill,
    roles: ["pharmacy", "dentist", "clinic_admin", "super_admin"],
  },
  {
    to: "/inventory",
    labelKey: "inventory",
    icon: Package,
    roles: ["clinic_admin", "dentist", "super_admin"],
  },
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
  },
  {
    to: "/billing",
    labelKey: "billing",
    icon: Receipt,
    roles: ["super_admin", "clinic_admin", "receptionist", "accountant", "dentist"],
  },
  {
    to: "/ai",
    labelKey: "aiAssist",
    icon: Sparkles,
    roles: ["super_admin", "clinic_admin", "dentist", "hygienist", "receptionist"],
  },
  {
    to: "/reports",
    labelKey: "reports",
    icon: BarChart3,
    roles: ["super_admin", "clinic_admin", "accountant", "dentist"],
  },
  {
    to: "/",
    labelKey: "dashboard",
    icon: LayoutDashboard,
  },
];

function roleAllows(roles: string[] | undefined, role: string | undefined | null): boolean {
  if (!roles) return true;
  if (!role) return false;
  return roles.includes(role);
}

export function navForRole(role: string | undefined | null): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const entry of ALL) {
    if (!roleAllows(entry.roles, role)) continue;
    if (isNavGroup(entry)) {
      const children = entry.children.filter((c) => roleAllows(c.roles, role));
      if (children.length > 0) entries.push({ ...entry, children });
    } else {
      entries.push(entry);
    }
  }
  return entries;
}

/** Flat list (dropdown children inlined) — mobile tab bar and path guards. */
export function flatNavForRole(role: string | undefined | null): NavItem[] {
  return navForRole(role).flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
}

export function roleHomePath(role: string | undefined | null): string {
  switch (role) {
    case "super_admin":
      return "/owner";
    case "clinic_admin":
      return "/admin";
    case "receptionist":
      return "/front-desk";
    case "dentist":
      return "/clinical";
    case "hygienist":
      return "/hygiene";
    case "imaging_tech":
      return "/imaging";
    case "lab_tech":
      return "/lab";
    case "pharmacy":
      return "/pharmacy";
    case "accountant":
      return "/billing";
    default:
      return "/";
  }
}

export function roleHomeLabel(role: string | undefined | null): string {
  switch (role) {
    case "dentist":
      return "Clinical chair";
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

export function canAccessPath(role: string | undefined | null, path: string): boolean {
  const flat = ALL.flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
  const item = flat.find((n) => n.to === path || (path.startsWith(n.to + "/") && n.to !== "/"));
  if (!item) return true;
  if (!item.roles) return true;
  if (!role) return false;
  return item.roles.includes(role);
}
