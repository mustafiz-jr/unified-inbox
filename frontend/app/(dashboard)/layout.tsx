'use client';

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  FiHome,
  FiLogOut,
  FiMenu,
  FiX,
  FiUser,
  FiMail,
  FiBell,
  FiUsers,
} from "react-icons/fi";
import Link from "next/link";
import { getAuthToken, removeAuthToken } from "@/lib/cookies";
import Loading from "@/app/components/loading/Loading";
import "@/app/globals.css";

const sidebarItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: FiHome,
    href: '/',
    badge: null,
  },
  {
    id: 'users',
    label: 'Users',
    icon: FiUsers,
    href: '/users',
    badge: { type: 'number', count: 4 },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: FiUsers,
    href: '/whatsApp',
    badge: { type: 'number', count: 1 },
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeItemId = sidebarItems.find(item => item.href === pathname)?.id || null;

  useEffect(() => {
    const checkScreen = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
        setMobileMenuOpen(false);
      }
    };
    checkScreen();
    window.addEventListener("resize", checkScreen);
    return () => window.removeEventListener("resize", checkScreen);
  }, []);

  const toggleSidebar = () => {
    if (isMobile) setMobileMenuOpen(!mobileMenuOpen);
    else setSidebarOpen(!sidebarOpen);
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push("/login");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        removeAuthToken();
        router.push("/login");
      } else {
        console.error("Logout failed:", await res.text());
        removeAuthToken();
        router.push("/login");
      }
    } catch (error) {
      console.error("Logout error:", error);
      removeAuthToken();
      router.push("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  const SidebarContent = ({ activeId }: { activeId: string | null }) => (
    <>
      <div className="border-b border-white/15 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-surface shadow-sm">
            <FiUser size={20} />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-primary bg-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">John Doe</p>
            <p className="mt-0.5 truncate text-xs text-white/65">john@example.com</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Workspace
        </p>
        <div className="space-y-1.5">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeId;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${isActive
                  ? 'bg-secondary text-white shadow-sm'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-white/15 px-1.5 text-[10px] font-semibold text-white">
                    {item.badge.type === 'dot' ? (
                      <span className="h-2 w-2 rounded-full bg-accent" />
                    ) : (
                      item.badge.count
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/15 p-4">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="group flex w-full justify-center items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-secondary transition hover:bg-accent hover:text-white border border-secondary hover:border-accent hover:font-semibold disabled:opacity-50 min-h-[46px]"
        >
          {loggingOut ? <Loading size="sm" /> : <><FiLogOut size={19} /> <span>Logout</span></>}
        </button>
      </div>
    </>
  );

  const LiveDateTime = () => {
    const [dateTime, setDateTime] = useState("");
    useEffect(() => {
      const update = () =>
        setDateTime(
          new Date().toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      update();
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }, []);
    return <span>{dateTime}</span>;
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface">
      <aside
        className={`hidden shrink-0 overflow-hidden bg-primary shadow-[4px_0_20px_rgba(29,33,40,0.08)] transition-all duration-300 ease-in-out lg:flex ${sidebarOpen ? "w-[250px]" : "w-0"
          }`}
      >
        <div className="flex h-full w-[250px] flex-col">
          <SidebarContent activeId={activeItemId} />
        </div>
      </aside>

      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 lg:hidden ${isMobile && mobileMenuOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
          }`}
        onClick={closeMobileMenu}
      >
        <div
          className={`relative h-full w-[280px] max-w-[82vw] bg-primary shadow-2xl transition-transform duration-300 ease-in-out ${isMobile && mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={closeMobileMenu}
            className="absolute right-4 top-4 z-10 rounded-full border border-white/20 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <FiX size={22} />
          </button>
          <div className="flex h-full flex-col pt-14">
            <SidebarContent activeId={activeItemId} />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative flex h-16 shrink-0 items-center border-b border-black/10 bg-secondary px-4 shadow-sm lg:px-6">
          <button
            onClick={toggleSidebar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text transition hover:bg-black/10 active:scale-95"
          >
            {isMobile
              ? mobileMenuOpen
                ? <FiX size={23} />
                : <FiMenu size={23} />
              : sidebarOpen
                ? <FiX size={23} />
                : <FiMenu size={23} />}
          </button>

          <div className="absolute left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2.5">
              <div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-primary text-secondary shadow-sm sm:flex">
                <FiMail size={17} />
              </div>
              <Link href="/" className="whitespace-nowrap text-lg font-bold tracking-wide text-text sm:text-xl lg:text-2xl">
                Unified Inbox
              </Link>
            </div>
          </div>

          <div className="ml-auto hidden rounded-lg bg-black/5 px-3 py-1.5 text-xs font-medium text-text/70 sm:block">
            <LiveDateTime />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-surface p-3 sm:p-4 lg:p-6">
          <div className="mx-auto h-full w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}