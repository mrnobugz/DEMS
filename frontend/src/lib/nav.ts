import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarDays,
  ClipboardPlus,
  FlaskConical,
  LayoutDashboard,
  Package,
  Pill,
  Receipt,
  Scan,
  Settings2,
  Sparkles,
  Stethoscope,
  Users,
  UserRoundCog,
  BarChart3,
} from "lucide-react";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  roles?: string[];
};

const ALL: NavItem[] = [
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

export function navForRole(role: string | undefined | null): NavItem[] {
  if (!role) return ALL.filter((i) => !i.roles);
  return ALL.filter((item) => !item.roles || item.roles.includes(role));
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
  const item = ALL.find((n) => n.to === path || (path.startsWith(n.to + "/") && n.to !== "/"));
  if (!item) return true;
  if (!item.roles) return true;
  if (!role) return false;
  return item.roles.includes(role);
}
