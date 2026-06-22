import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Mic, Settings, Shield } from "lucide-react";

const nav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Meetings" },
  { to: "/record", icon: Mic, label: "New Meeting" },
  { to: "/setup", icon: Settings, label: "Setup" },
];

export default function Layout({ children }) {
  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <aside className="w-[200px] flex-shrink-0 bg-vault-surface border-r border-vault-border flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-vault-border">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-vault-accent" />
            <span className="font-mono font-semibold text-vault-text text-sm tracking-tight">Listne</span>
          </div>
          <p className="text-vault-text-dim text-[10px] mt-1 font-mono">a gugubi product</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-vault-accent/10 text-vault-accent font-medium"
                    : "text-vault-text-dim hover:text-vault-text hover:bg-vault-border/40"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-vault-border">
          <p className="text-vault-text-dim text-[10px] font-mono">v1.0.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-vault-bg">
        {children}
      </main>
    </div>
  );
}
