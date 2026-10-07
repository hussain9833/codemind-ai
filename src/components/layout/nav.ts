import { Activity, AlertTriangle, FileCode2, FolderGit2, GitPullRequest, LayoutDashboard, MessageSquare, Network, Search, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup { label: string; items: NavItem[] }

/** Navigation grouped by what the user is doing. Same routes as before. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Projects", href: "/projects", icon: FolderGit2 },
      { label: "Ask", href: "/ask", icon: MessageSquare },
    ],
  },
  {
    label: "Investigate",
    items: [
      { label: "Investigations", href: "/investigations", icon: Search },
      { label: "Incidents", href: "/incidents", icon: AlertTriangle },
      { label: "Pull Requests", href: "/pull-requests", icon: GitPullRequest },
    ],
  },
  {
    label: "Codebase",
    items: [
      { label: "Repository", href: "/repository", icon: FileCode2 },
      { label: "Architecture", href: "/architecture", icon: Network },
      { label: "Health", href: "/health", icon: Activity },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
export const SETTINGS_ITEM: NavItem = { label: "Settings", href: "/settings", icon: Settings };
