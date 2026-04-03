import {
  LayoutDashboard,
  Clock,
  TestTubes,
  Pill,
  Upload,
  Share2,
  MessageSquare,
  Settings,
  ListChecks,
  Cable,
  Microscope,
  FileText,
  GitCompareArrows,
  HeartPulse,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: boolean;
}

// Primary navigation — focused on health optimization workflow
export const navigation: NavItem[] = [
  { name: "Home", href: "/home", icon: LayoutDashboard },
  { name: "Labs", href: "/labs", icon: TestTubes },
  { name: "Uploads", href: "/uploads", icon: Upload },
  { name: "AI Coach", href: "/ai", icon: MessageSquare },
];

// Secondary nav — additional tools
export const secondaryNav: NavItem[] = [
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "Timeline", href: "/timeline", icon: Clock },
  { name: "Testing", href: "/testing", icon: Microscope },
  { name: "Biomarkers", href: "/biomarkers", icon: ListChecks },
  { name: "Correlations", href: "/correlations", icon: GitCompareArrows },
  { name: "Medications", href: "/medications", icon: Pill },
  { name: "Conditions", href: "/conditions", icon: HeartPulse },
  { name: "Encounters", href: "/encounters", icon: Stethoscope },
];

// All mobile nav items
export const allMobileNav: NavItem[] = [
  ...navigation,
  ...secondaryNav,
  { name: "Integrations", href: "/integrations", icon: Cable },
  { name: "Settings", href: "/settings", icon: Settings },
];
