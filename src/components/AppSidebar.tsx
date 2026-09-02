import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardList,
  FlaskConical,
  Inbox,
  History,
  LineChart,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { to: "/", label: "Event log", hint: "Live webhook stream", icon: ClipboardList },
  { to: "/rules", label: "Knowledge base", hint: "Failure signal rules", icon: BookOpen },
  { to: "/business-review", label: "Review desk", hint: "Alerts & conversations", icon: Inbox },
  { to: "/recovery-summary", label: "Recovery summary", hint: "Batch report", icon: LineChart },
  { to: "/audit-trail", label: "Audit Trail", hint: "Full decision history", icon: History },
  { to: "/test-checkout", label: "Simulator", hint: "Test sandbox", icon: FlaskConical },
];

const itemClass =
  "group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm text-sidebar-foreground/75 transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[status=active]:border-sidebar-border data-[status=active]:bg-card data-[status=active]:font-semibold data-[status=active]:text-sidebar-foreground data-[status=active]:shadow-[var(--shadow-card)]";

function Brand() {
  return (
    <Link to="/" search={{}} className="flex items-center gap-3 px-3 py-1">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
        RR
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[14px] font-semibold leading-tight text-sidebar-foreground">
          Revenue Risk Radar
        </span>
        <span className="block truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Recovery console
        </span>
      </span>
    </Link>
  );
}

/** Persistent admin-console navigation: sidebar on desktop, icon rail on mobile. */
export function AppSidebar() {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-sidebar-border px-3 py-4">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </p>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              search={{}}
              activeOptions={{ exact: item.to === "/" }}
              className={itemClass}
            >
              <item.icon className="h-4 w-4 shrink-0 opacity-70 group-data-[status=active]:text-primary group-data-[status=active]:opacity-100" />
              <span className="min-w-0">
                <span className="block truncate leading-tight">{item.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.hint}
                </span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-6 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Razorpay · IST
          </p>
        </div>
      </aside>

      <div className="sticky top-0 z-30 border-b border-border bg-sidebar/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              search={{}}
              activeOptions={{ exact: item.to === "/" }}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-[13px] text-muted-foreground transition-colors data-[status=active]:border-border data-[status=active]:bg-card data-[status=active]:font-semibold data-[status=active]:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
