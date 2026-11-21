import { ReactNode, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  CreditCard,
  FolderKanban,
  HelpCircle,
  History,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Scissors,
  Settings,
  SlidersHorizontal,
  Subtitles,
  X,
} from 'lucide-react';
import { WorkspaceTab } from '../types/clipforge';
import { BrandMark } from './BrandMark';

interface WorkspaceLayoutProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onBackToLanding: () => void;
  availableCreditsMinutes: number;
  creatorName: string;
  savedClipsCount?: number;
  children: ReactNode;
}

interface NavItem {
  id: WorkspaceTab;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function WorkspaceLayout({
  activeTab,
  onSelectTab,
  onBackToLanding,
  availableCreditsMinutes,
  creatorName,
  savedClipsCount = 0,
  children,
}: WorkspaceLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const navSections: NavSection[] = [
    {
      title: 'MAIN',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'create', label: 'Create Clips', icon: Scissors },
        { id: 'live', label: 'Live Clipper', icon: Radio },
        { id: 'projects', label: 'My Projects', icon: FolderKanban },
        { id: 'editor', label: 'Video Editor', icon: SlidersHorizontal },
      ],
    },
    {
      title: 'LIBRARY',
      items: [
        { id: 'templates', label: 'Caption Templates', icon: Subtitles },
        {
          id: 'saved',
          label: 'Saved Clips',
          icon: Bookmark,
          badge: savedClipsCount > 0 ? savedClipsCount : undefined,
        },
        { id: 'exports', label: 'Export History', icon: History },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'billing', label: 'Billing', icon: CreditCard },
        { id: 'help', label: 'Help & Support', icon: HelpCircle },
      ],
    },
  ];

  const allItems = navSections.flatMap((s) => s.items);
  const activeNav = allItems.find((item) => item.id === activeTab);

  const handleNavClick = (tab: WorkspaceTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  const renderNavSections = (isCompact: boolean) => (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Workspace navigation">
      {navSections.map((section) => (
        <div key={section.title} className="space-y-1">
          {!isCompact && (
            <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-[#737373] uppercase">
              {section.title}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={isCompact ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`nav-${item.id}`}
                  onClick={() => handleNavClick(item.id)}
                  className={`relative w-full flex items-center ${
                    isCompact ? 'justify-center px-2' : 'justify-between px-3'
                  } py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#FEF2F2] text-[#DC2626] font-semibold'
                      : 'text-[#525252] hover:text-[#171717] hover:bg-[#F5F5F5]'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[#DC2626]"
                    />
                  )}
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-[#DC2626]' : 'text-[#737373]'
                      }`}
                    />
                    {!isCompact && <span className="truncate">{item.label}</span>}
                  </span>
                  {!isCompact && item.badge !== undefined && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        isActive ? 'text-[#DC2626]' : 'text-[#737373]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#171717] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col shrink-0 bg-[#FFFFFF] border-r border-[#E5E5E5] sticky top-0 h-screen transition-[width] duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[248px]'
        }`}
      >
        <div
          className={`h-16 px-4 flex items-center border-b border-[#E5E5E5] ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <button
            type="button"
            onClick={onBackToLanding}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded-lg"
            aria-label="Return to ClipForge AI landing page"
          >
            <BrandMark compact={collapsed} size="sm" />
          </button>

          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              data-testid="sidebar-collapse-btn"
              className="p-1.5 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5] transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="px-3 pt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              data-testid="sidebar-expand-btn"
              className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5] transition-colors"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        {renderNavSections(collapsed)}

        {/* Sidebar Footer: Credits + Creator */}
        <div className="p-3 border-t border-[#E5E5E5] space-y-2.5">
          {!collapsed ? (
            <>
              <div className="rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#737373] font-medium">AI Credits</span>
                  <span className="font-mono font-semibold tabular-nums text-[#171717]">
                    {availableCreditsMinutes} min
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#E5E5E5] overflow-hidden">
                  <div
                    className="h-full bg-[#DC2626] rounded-full transition-[width] duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((availableCreditsMinutes / 180) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-1.5 pt-0.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#171717] truncate">{creatorName}</p>
                  <p className="text-[11px] text-[#737373]">Creator Studio</p>
                </div>
                <button
                  type="button"
                  onClick={onBackToLanding}
                  title="Back to landing page"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5] transition-colors whitespace-nowrap"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>Home</span>
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onBackToLanding}
              title="Back to landing page"
              aria-label="Back to landing page"
              className="w-full flex items-center justify-center p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/35 backdrop-blur-[2px]"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-[272px] max-w-[85vw] h-full bg-[#FFFFFF] border-r border-[#E5E5E5] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#E5E5E5]">
              <BrandMark size="sm" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-[#F5F5F5]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderNavSections(false)}

            <div className="p-3 border-t border-[#E5E5E5] space-y-2">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-[#737373]">Available Credits</span>
                <span className="font-mono font-semibold tabular-nums text-[#171717]">
                  {availableCreditsMinutes} min
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onBackToLanding();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#FFFFFF] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-xs font-medium text-[#171717]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Home</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header (compact single row <= 56px) */}
        <header className="lg:hidden sticky top-0 z-30 h-14 px-4 flex items-center justify-between bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E5E5]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              data-testid="mobile-menu-btn"
              className="p-2 -ml-1.5 rounded-lg text-[#171717] hover:bg-[#F5F5F5]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-display text-sm font-semibold text-[#171717] truncate">
              {activeNav?.label || 'ClipForge AI'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onSelectTab('create')}
            className="px-3 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold whitespace-nowrap transition-colors"
          >
            + New
          </button>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
