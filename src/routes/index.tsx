import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast, Toaster } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Compass,
  Download,
  FileCheck,
  FileText,
  Filter,
  Gauge,
  HardHat,
  ImagePlus,
  Layers3,
  LocateFixed,
  MapPin,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserCog,
  Users,
  UsersRound,
  Waves,
  X,
  LogIn,
  LogOut,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CivicGeoMap, type MapPosition } from "@/components/CivicGeoMap";
import { useAuth } from "@/context/AuthContext";
import {
  subscribeToIssues,
  saveIssueToFirestore,
  updateIssueStatusInFirestore,
} from "@/services/issueDataService";
import { uploadEvidenceImage } from "@/services/firebaseStorageService";
import {
  createDemoIssues,
  defaultCivicSettings,
  departments,
  categories,
  initialNotifications,
  officers,
  wards,
  civicAreas,
  type CivicIssue,
  type CivicRole,
  type CivicSettings,
  type CivicStatus,
  type CivicTimelineEvent,
} from "@/lib/civic-data";
import {
  analyzeImage,
  detectDuplicates,
  type AIAnalysis,
  type DuplicateSuggestion,
} from "@/services/aiService";
import {
  fallbackLocation,
  getCurrentLocation,
  resolveLocation,
  type LocationMeta,
  LocationServiceError,
} from "@/services/locationService";
import { getSlaStatus } from "@/services/slaService";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CivicPulse | Smarter Civic Infrastructure" },
      {
        name: "description",
        content:
          "From citizen reports to smarter cities. Report issues, track resolutions, and help improve your city.",
      },
      { property: "og:title", content: "CivicPulse | Smarter Civic Infrastructure" },
      { property: "og:description", content: "From citizen reports to smarter cities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CivicPulse,
});

type View =
  | "home"
  | "dashboard"
  | "report"
  | "reports"
  | "detail"
  | "map"
  | "intelligence"
  | "admin"
  | "notifications";

const nav = [
  { id: "dashboard", label: "Overview", icon: Gauge },
  { id: "reports", label: "Issue queue", icon: ClipboardList },
  { id: "map", label: "Civic map", icon: MapPin },
  { id: "intelligence", label: "Civic intelligence", icon: BarChart3 },
  { id: "notifications", label: "Notifications", icon: Bell },
] as const;

const prettyStatus = (status: CivicStatus) =>
  status === "AWAITING CITIZEN VERIFICATION"
    ? "Awaiting verification"
    : status.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusStyle = (status: CivicStatus) =>
  status === "RESOLVED"
    ? "bg-emerald-50 text-emerald-700"
    : status === "IN PROGRESS" || status === "ASSIGNED"
      ? "bg-sky-50 text-sky-700"
      : status === "AWAITING CITIZEN VERIFICATION"
        ? "bg-violet-50 text-violet-700"
        : status === "REOPENED" || status === "REJECTED"
          ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-800";

const priorityStyle = (priority: CivicIssue["priority"]) =>
  priority === "Critical"
    ? "bg-rose-100 text-rose-800"
    : priority === "High"
      ? "bg-orange-100 text-orange-800"
      : priority === "Medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";

const defaultTimeline = (): CivicTimelineEvent[] => [
  { label: "Report submitted", detail: "Citizen report received", at: "Saved", done: true },
  { label: "AI triage complete", detail: "Assisted classification", at: "Saved", done: true },
  { label: "Municipal review", detail: "Awaiting assignment", at: "Next", done: false },
  { label: "Resolution", detail: "Not submitted", at: "Pending", done: false },
];

function normalizeIssue(issue: Partial<CivicIssue>, index: number): CivicIssue {
  const latitude = issue.latitude ?? issue.lat ?? 19.77;
  const longitude = issue.longitude ?? 74.55;
  return {
    id: issue.id ?? `CP-2026-${String(index + 1).padStart(5, "0")}`,
    title: issue.title ?? "Civic issue",
    category: issue.category ?? categories[0] ?? "Infrastructure",
    location: issue.location ?? issue.address ?? "Supported CivicPulse area",
    ward: issue.ward ?? "Demo Ward",
    department: issue.department ?? departments[0] ?? "Infrastructure",
    priority: issue.priority ?? "Medium",
    status: issue.status ?? "NEW",
    age: issue.age ?? "Just now",
    citizen: issue.citizen ?? "Rahul Sharma",
    description: issue.description ?? "Civic issue reported by a resident.",
    confidence: issue.confidence ?? 82,
    lat: latitude,
    left: issue.left ?? 50,
    top: issue.top ?? 50,
    latitude,
    longitude,
    address: issue.address ?? issue.location ?? "Supported CivicPulse area",
    city: issue.city ?? "Kopargaon",
    area: issue.area ?? "Main Road",
    createdAt: issue.createdAt ?? new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    aiSummary: issue.aiSummary ?? "Assisted classification is available for this demo report.",
    impact: issue.impact ?? "Localized disruption reported by residents.",
    duplicateIds: issue.duplicateIds ?? [],
    notes: issue.notes ?? [],
    timeline: issue.timeline ?? defaultTimeline(),
    ...(issue.assignedOfficer ? { assignedOfficer: issue.assignedOfficer } : {}),
    ...(issue.resolutionNotes ? { resolutionNotes: issue.resolutionNotes } : {}),
    ...(issue.image ? { image: issue.image } : {}),
    ...(issue.beforeImage ? { beforeImage: issue.beforeImage } : {}),
    ...(issue.afterImage ? { afterImage: issue.afterImage } : {}),
  };
}

function normalizeIssues(raw: unknown): CivicIssue[] {
  return Array.isArray(raw)
    ? raw.map((issue, index) => normalizeIssue(issue as Partial<CivicIssue>, index))
    : createDemoIssues();
}

function normalizeSettings(raw: unknown): CivicSettings {
  const saved = raw && typeof raw === "object" ? (raw as Partial<CivicSettings>) : {};
  const isRealEnforced = import.meta.env["VITE_MOCK_AI_MODE"] === "false";
  const isMockEnforced = import.meta.env["VITE_MOCK_AI_MODE"] === "true";
  return {
    ...defaultCivicSettings,
    ...saved,
    aiMode: isRealEnforced
      ? "real"
      : isMockEnforced
        ? "mock"
        : (saved.aiMode ?? defaultCivicSettings.aiMode),
    slaHours: { ...defaultCivicSettings.slaHours, ...(saved.slaHours ?? {}) },
    departments: saved.departments?.length ? saved.departments : defaultCivicSettings.departments,
    categories: saved.categories?.length ? saved.categories : defaultCivicSettings.categories,
    enabledPriorities: saved.enabledPriorities?.length
      ? saved.enabledPriorities
      : defaultCivicSettings.enabledPriorities,
  };
}

function serializeIssues(issues: CivicIssue[]) {
  return issues.map(({ image, beforeImage, afterImage, ...issue }) => issue);
}

function CivicPulse() {
  const {
    user,
    profile,
    role: authRole,
    isFirebaseConnected,
    signInWithGoogle,
    switchDemoRole,
    logout,
  } = useAuth();
  const [role, setRole] = useState<CivicRole | null>(null);
  const [view, setView] = useState<View>("home");
  const [issues, setIssues] = useState<CivicIssue[]>(() => createDemoIssues());
  const [settings, setSettings] = useState<CivicSettings>(() => defaultCivicSettings);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState("CIV-2026-00124");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All issues");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [mobileNav, setMobileNav] = useState(false);
  const [newIssueId, setNewIssueId] = useState<string | null>(null);

  // Sync role with auth state
  useEffect(() => {
    if (user) {
      setRole(authRole);
    }
  }, [user, authRole]);

  // Real-time Firestore subscription with seeded fallback
  useEffect(() => {
    const unsub = subscribeToIssues((remoteIssues) => {
      setIssues(remoteIssues);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("civicpulse-demo");
    if (stored) {
      try {
        const state = JSON.parse(stored);
        if (state.role && !user) {
          setRole(state.role);
          setView("dashboard");
        }
        if (state.issues?.length) setIssues(normalizeIssues(state.issues));
        if (state.settings) setSettings(normalizeSettings(state.settings));
      } catch {
        /* Use fresh demo data if the saved demo state is unavailable. */
      }
    }
    setHydrated(true);
  }, [user]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "civicpulse-demo",
      JSON.stringify({ role, issues: serializeIssues(issues), settings }),
    );
  }, [hydrated, issues, role, settings]);

  const activeIssues = issues.length ? issues : createDemoIssues();
  const selectedIssue = activeIssues.find((issue) => issue.id === selectedId) ?? activeIssues[0];

  const visibleIssues = useMemo(
    () =>
      activeIssues.filter((issue) => {
        const matchesSearch =
          `${issue.id} ${issue.title} ${issue.category} ${issue.location} ${issue.ward} ${issue.department} ${issue.status}`
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchesFilter =
          filter === "All issues" ||
          issue.status === filter.toUpperCase() ||
          (filter === "Open" &&
            ["NEW", "UNDER REVIEW", "ASSIGNED", "REOPENED"].includes(issue.status));
        return matchesSearch && matchesFilter;
      }),
    [activeIssues, search, filter],
  );

  const enterRole = (nextRole: CivicRole) => {
    setRole(nextRole);
    switchDemoRole(nextRole);
    setView("dashboard");
    setMobileNav(false);
    toast.success(
      `Viewing CivicPulse as ${nextRole === "officer" ? "Municipal Officer" : nextRole === "admin" ? "Administrator" : "Citizen"}`,
    );
  };

  const changeStatus = (id: string, status: CivicStatus, note?: string, evidenceImage?: string) => {
    setIssues((current) =>
      current.map((issue) =>
        issue.id === id
          ? {
              ...issue,
              status,
              ...(evidenceImage
                ? { afterImage: evidenceImage, resolutionEvidence: evidenceImage }
                : {}),
              timeline: (issue.timeline ?? []).map((event, index) => ({
                ...event,
                done:
                  index <
                  (status === "RESOLVED"
                    ? 4
                    : status === "AWAITING CITIZEN VERIFICATION"
                      ? 4
                      : status === "IN PROGRESS"
                        ? 3
                        : 2),
              })),
            }
          : issue,
      ),
    );
    toast.success(`Issue updated to ${prettyStatus(status)}`);
    updateIssueStatusInFirestore(
      id,
      status,
      {
        name: profile.displayName || "Civic Officer",
        id: user?.uid || profile.uid,
        role: profile.role,
      },
      note,
      evidenceImage,
    ).catch((err) => console.warn("[CivicPulse] Firestore update warning:", err));
  };

  const updateIssue = (id: string, patch: Partial<CivicIssue>) => {
    setIssues((current) =>
      current.map((issue) => (issue.id === id ? { ...issue, ...patch } : issue)),
    );
    saveIssueToFirestore({ id, ...patch } as CivicIssue).catch((err) =>
      console.warn("[CivicPulse] Firestore update notice:", err),
    );
  };

  const openIssue = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };

  if (!role && view === "home")
    return (
      <Landing
        onSelectRole={enterRole}
        onGoMap={() => {
          setRole("citizen");
          setView("map");
        }}
      />
    );

  return (
    <div className="civic-shell flex">
      <Toaster position="top-right" richColors />
      <aside
        className={`${mobileNav ? "fixed inset-y-0 left-0 z-40 flex" : "hidden"} w-[250px] shrink-0 flex-col border-r border-border bg-card px-5 py-6 md:sticky md:top-0 md:flex md:h-screen`}
      >
        <div className="flex items-center gap-3 pb-9">
          <img src="/civicpulse.svg" alt="" className="h-10 w-10 rounded-lg" />
          <div>
            <div className="text-[17px] font-bold leading-tight tracking-[-0.3px]">CivicPulse</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[1.25px] text-muted-foreground">
              City operations
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto md:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X />
          </Button>
        </div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.3px] text-muted-foreground">
          Workspace
        </div>
        <nav className="space-y-1">
          {nav.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="ghost"
              className={`h-10 w-full justify-start gap-3 rounded-md px-3 text-[13px] ${view === id || (id === "reports" && view === "detail") ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`}
              onClick={() => {
                setView(id);
                setMobileNav(false);
              }}
            >
              <Icon className="h-[17px] w-[17px]" />
              {label}
              {id === "notifications" && (
                <span className="ml-auto h-2 w-2 rounded-full bg-orange-500" />
              )}
            </Button>
          ))}
        </nav>
        {role === "admin" && (
          <>
            <div className="mb-3 mt-8 px-3 text-[10px] font-bold uppercase tracking-[1.3px] text-muted-foreground">
              Administration
            </div>
            <Button
              variant="ghost"
              className={`h-10 w-full justify-start gap-3 rounded-md px-3 text-[13px] ${view === "admin" ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`}
              onClick={() => setView("admin")}
            >
              <Building2 className="h-[17px] w-[17px]" />
              Manage city
            </Button>
          </>
        )}
        <div className="mt-auto border-t border-border pt-5">
          <div className="mb-4 flex items-center gap-3 px-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-sm font-semibold text-primary">
              {user
                ? user.displayName
                  ? user.displayName.slice(0, 2).toUpperCase()
                  : "US"
                : role === "officer"
                  ? "MO"
                  : role === "admin"
                    ? "AD"
                    : "RS"}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">
                {user ? user.displayName || user.email : profile.displayName}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {user ? user.email : "CivicPulse Demo Data"}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-9 w-full justify-between border-border text-xs"
            onClick={() => {
              setRole(null);
              setView("home");
            }}
          >
            <span>{user ? "Switch role view" : "Switch demo role"}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <div className="mt-4 flex items-center gap-2 px-2 text-[10px] text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isFirebaseConnected ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {user ? "Firebase Authenticated" : "Cloud Firestore Connected"}
          </div>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
      )}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-[66px] items-center border-b border-border bg-card/95 px-4 backdrop-blur md:px-8">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            className="mr-2 md:hidden"
            onClick={() => setMobileNav(true)}
          >
            <Menu />
          </Button>
          <div className="relative w-full max-w-[460px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search issues, locations, wards…"
              className="h-9 border-0 bg-muted pl-9 text-[13px] shadow-none focus-visible:ring-1"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isFirebaseConnected && (
              <span className="hidden items-center gap-1.5 rounded-sm bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 sm:inline-flex border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Firestore Live
              </span>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-[11px] font-medium text-muted-foreground md:inline">
                  {user.email}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={async () => {
                    await logout();
                    toast.info("Signed out");
                  }}
                >
                  <LogOut className="h-3.5 w-3.5 mr-1" />
                  Sign out
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[11px] font-medium border-primary/30"
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                    toast.success("Signed in with Google");
                  } catch (e: unknown) {
                    const err = e as { code?: string; message?: string };
                    if (err?.code === "auth/unauthorized-domain") {
                      toast.info(
                        "Firebase Auth domain not authorized on this preview URL. Use Switch demo role to explore Citizen, Municipal Officer, or Admin views.",
                        { duration: 8000 },
                      );
                    } else {
                      console.error(e);
                      toast.error(err?.message || "Google sign in cancelled or unavailable");
                    }
                  }
                }}
              >
                <LogIn className="h-3.5 w-3.5 mr-1 text-primary" />
                Sign in with Google
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label="Notifications"
              onClick={() => setView("notifications")}
            >
              <Bell className="h-[18px] w-[18px]" />
              {notifications.some((item) => item.unread) && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-card" />
              )}
            </Button>
          </div>
        </header>

        <div className="mx-auto max-w-[1450px] px-4 py-7 md:px-8 md:py-8">
          {view === "dashboard" && (
            <Dashboard
              role={role ?? "citizen"}
              issues={activeIssues}
              settings={settings}
              onReport={() => setView("report")}
              onIssue={openIssue}
              onViewAll={() => setView("reports")}
              onOpenMap={() => setView("map")}
              onOpenIntelligence={() => setView("intelligence")}
            />
          )}

          {view === "report" && (
            <ReportWizard
              existingIssues={activeIssues}
              settings={settings}
              onCancel={() => setView("dashboard")}
              onTrack={() => setView("detail")}
              onSubmit={(issue) => {
                setIssues((current) => [issue, ...current]);
                setNewIssueId(issue.id);
                setSelectedId(issue.id);
                saveIssueToFirestore({
                  ...issue,
                  citizenId: user?.uid || profile.uid,
                  citizenEmail: user?.email || profile.email,
                  citizen: profile.displayName || issue.citizen,
                }).catch((err) => console.warn("[CivicPulse] Firestore save notice:", err));
                toast.success("Your civic report was submitted and saved.");
              }}
            />
          )}

          {view === "reports" && (
            <IssueQueue
              role={role ?? "citizen"}
              issues={visibleIssues}
              search={search}
              filter={filter}
              onFilter={setFilter}
              onIssue={openIssue}
            />
          )}

          {view === "detail" && selectedIssue && (
            <IssueDetail
              issue={selectedIssue}
              role={role ?? "citizen"}
              isNew={newIssueId === selectedIssue.id}
              onBack={() => setView("reports")}
              onStatus={(status) => changeStatus(selectedIssue.id, status)}
              onUpdate={(patch) => updateIssue(selectedIssue.id, patch)}
            />
          )}

          {view === "map" && (
            <CivicMap issues={visibleIssues} search={search} onIssue={openIssue} />
          )}

          {view === "intelligence" && <Intelligence issues={activeIssues} />}

          {view === "admin" && (
            <AdminDashboard issues={activeIssues} settings={settings} onSave={setSettings} />
          )}

          {view === "notifications" && (
            <Notifications
              items={notifications}
              onRead={(id) =>
                setNotifications((items) =>
                  items.map((item) => (item.id === id ? { ...item, unread: false } : item)),
                )
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Landing({
  onSelectRole,
  onGoMap,
}: {
  onSelectRole: (role: CivicRole) => void;
  onGoMap: () => void;
}) {
  const [showRoles, setShowRoles] = useState(false);

  return (
    <div className="min-h-screen bg-card text-foreground">
      <Toaster position="top-right" richColors />
      <header className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <img src="/civicpulse.svg" alt="CivicPulse" className="h-10 w-10 rounded-lg" />
          <span className="text-[18px] font-bold">CivicPulse</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="hidden text-sm text-muted-foreground sm:inline-flex"
            onClick={onGoMap}
          >
            Explore civic map
          </Button>
          <Button className="h-10 px-5" onClick={() => setShowRoles(true)}>
            Open demo <ArrowRight />
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden border-y border-border bg-background">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-16 md:grid-cols-[1.03fr_.97fr] md:py-[92px]">
          <div className="relative z-10">
            <div className="mb-7 inline-flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[1px] text-primary">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Maharashtra • Civic infrastructure
            </div>
            <h1 className="max-w-[590px] text-[48px] font-semibold leading-[1.07] tracking-[-1.3px] md:text-[62px]">
              From citizen reports to <span className="text-primary">smarter cities.</span>
            </h1>
            <p className="mt-6 max-w-[500px] text-[16px] leading-7 text-muted-foreground">
              One connected platform to surface local issues, direct municipal action, and keep
              residents informed every step of the way.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-12 px-5" onClick={() => setShowRoles(true)}>
                Report a civic issue <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" className="h-12" onClick={onGoMap}>
                Explore civic map <MapPin />
              </Button>
            </div>
            <div className="mt-9 flex items-center gap-5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Built for residents
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Transparent resolution
              </span>
            </div>
          </div>

          <div className="relative min-h-[340px] overflow-hidden border border-border bg-card p-4 shadow-sm md:min-h-[410px] md:p-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[1px] text-muted-foreground">
                  Maharashtra • Live civic pulse
                </div>
                <div className="mt-1 text-[14px] font-semibold">Ward activity overview</div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Updated just now
              </div>
            </div>
            <div className="civic-map civic-grid relative mt-4 h-[220px] overflow-hidden md:h-[278px]">
              {[
                [22, 28, "High"],
                [54, 35, "Medium"],
                [74, 20, "High"],
                [41, 61, "Low"],
                [82, 69, "Critical"],
                [26, 76, "Medium"],
                [61, 79, "High"],
                [89, 42, "Low"],
              ].map(([left, top, level], index) => (
                <span
                  key={index}
                  className={`absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-card shadow-sm ${level === "Critical" ? "bg-rose-600" : level === "High" ? "bg-orange-500" : level === "Medium" ? "bg-amber-500" : "bg-emerald-600"}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <MapPin className="h-3.5 w-3.5 text-primary-foreground" />
                </span>
              ))}
              <div className="absolute bottom-3 left-3 bg-card px-3 py-2 text-[10px] text-muted-foreground shadow-sm">
                Kopargaon • Shrirampur • Shirdi
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border pt-4 text-center">
              <div>
                <div className="text-[18px] font-semibold">1,284</div>
                <div className="mt-1 text-[10px] text-muted-foreground">Reports tracked</div>
              </div>
              <div>
                <div className="text-[18px] font-semibold">76%</div>
                <div className="mt-1 text-[10px] text-muted-foreground">Resolved this month</div>
              </div>
              <div>
                <div className="text-[18px] font-semibold">18</div>
                <div className="mt-1 text-[10px] text-muted-foreground">Wards connected</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 py-14 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-primary">
              A clearer path to action
            </div>
            <h2 className="mt-3 text-[28px] font-semibold tracking-[-.5px]">
              Every report moves the city forward.
            </h2>
          </div>
          <p className="max-w-[360px] text-[13px] leading-6 text-muted-foreground">
            From the first photo to the final verification, CivicPulse keeps the whole response
            connected.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-2 border-l border-t border-border sm:grid-cols-4 lg:grid-cols-7">
          {[
            { icon: Camera, title: "Report", text: "Share a local issue" },
            { icon: Sparkles, title: "Understand", text: "AI-assisted review" },
            { icon: AlertTriangle, title: "Prioritize", text: "Surface what matters" },
            { icon: Compass, title: "Route", text: "Find the right team" },
            { icon: HardHat, title: "Resolve", text: "Track real progress" },
            { icon: CheckCircle2, title: "Verify", text: "Confirm the outcome" },
            { icon: TrendingUp, title: "Learn", text: "Improve over time" },
          ].map(({ icon: Icon, title, text }, index) => (
            <div key={title} className="min-h-[135px] border-b border-r border-border p-4">
              <div className="flex items-center justify-between">
                <Icon className="h-[19px] w-[19px] text-primary" />
                <span className="text-[10px] text-muted-foreground">0{index + 1}</span>
              </div>
              <div className="mt-5 text-[13px] font-semibold">{title}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">{text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-12 md:grid-cols-[.8fr_1.2fr] md:py-14">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[1.2px] text-primary">
              Built for better decisions
            </div>
            <h2 className="mt-3 max-w-[370px] text-[27px] font-semibold leading-tight">
              See patterns. Respond with purpose.
            </h2>
            <p className="mt-4 max-w-[390px] text-[13px] leading-6 text-muted-foreground">
              Understand where issues cluster, which teams need support, and what residents still
              need verified.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {[
              {
                icon: Layers3,
                title: "Connected reporting",
                copy: "Find nearby reports and link recurring concerns.",
              },
              {
                icon: Building2,
                title: "Smart routing",
                copy: "Get each issue to the right department sooner.",
              },
              {
                icon: Activity,
                title: "Resolution tracking",
                copy: "Follow updates from submission to verification.",
              },
              {
                icon: BarChart3,
                title: "Civic intelligence",
                copy: "Turn everyday reports into useful local insight.",
              },
            ].map(({ icon: Icon, title, copy }) => (
              <div key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
                <div>
                  <div className="text-[13px] font-semibold">{title}</div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-5 text-[11px] text-muted-foreground">
        <span>© 2026 CivicPulse • A civic technology demonstration</span>
        <span>Maharashtra Municipal Operations</span>
      </footer>

      {showRoles && (
        <RoleDialog
          onClose={() => setShowRoles(false)}
          onChoose={(selected) => {
            setShowRoles(false);
            onSelectRole(selected);
          }}
        />
      )}
    </div>
  );
}

function RoleDialog({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (role: CivicRole) => void;
}) {
  const { signInWithGoogle, isFirebaseConnected } = useAuth();
  const [domainNotice, setDomainNotice] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/45 p-4"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="choose-role"
        className="w-full max-w-[470px] border border-border bg-card p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1px] text-primary flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${isFirebaseConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}
              />
              CivicPulse • Cloud Backend & Auth
            </div>
            <h2 id="choose-role" className="mt-2 text-[22px] font-semibold">
              Choose your perspective
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Sign in with your verified account or explore with a demo role.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>

        {domainNotice && (
          <div className="mt-4 border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed">
            <div className="font-semibold text-amber-950 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
              Firebase Domain Authorization Note
            </div>
            <p className="mt-1">
              The preview URL <code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono text-[10px]">{window.location.hostname}</code> is not listed in Firebase authorized domains.
            </p>
            <p className="mt-1 text-muted-foreground text-[10px]">
              To enable Google sign-in: Add this hostname in Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains.
            </p>
            <p className="mt-1.5 font-medium text-emerald-800">
              👇 Select any Demo Perspective below to test the full app immediately:
            </p>
          </div>
        )}

        <div className="mt-5">
          <Button
            className="w-full h-11 bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 shadow-sm"
            onClick={async () => {
              try {
                await signInWithGoogle();
                onClose();
                toast.success("Signed in with Google account");
              } catch (e: unknown) {
                const err = e as { code?: string; message?: string };
                if (err?.code === "auth/unauthorized-domain") {
                  setDomainNotice(window.location.hostname);
                  toast.info(
                    "Domain not authorized in Firebase. Select a demo role below to explore.",
                    { duration: 6000 },
                  );
                } else {
                  console.error(e);
                  toast.error(err?.message || "Google sign in was cancelled or unavailable.");
                }
              }
            }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign in with Google
          </Button>
          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <span className="relative bg-card px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Or Explore with Demo Perspective
            </span>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          {[
            {
              role: "citizen" as const,
              title: "Continue as Citizen",
              detail: "Report and track local issues",
              email: "citizen.demo@example.com",
              icon: Users,
            },
            {
              role: "officer" as const,
              title: "Continue as Municipal Officer",
              detail: "Triage, assign and resolve reports",
              email: "authority.demo@example.com",
              icon: HardHat,
            },
            {
              role: "admin" as const,
              title: "Continue as Administrator",
              detail: "Review city-wide operations",
              email: "admin.demo@example.com",
              icon: Building2,
            },
          ].map(({ role, title, detail, email, icon: Icon }) => (
            <Button
              key={role}
              variant="outline"
              className="h-auto w-full justify-start gap-4 rounded-md p-4 text-left"
              onClick={() => onChoose(role)}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center bg-accent text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{title}</span>
                <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                  {detail}
                </span>
                <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                  {email}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-muted-foreground">
          Demo accounts use fictional names and local demonstration data.
        </p>
      </section>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="text-[10px] font-bold uppercase tracking-[1.25px] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-.5px] md:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  note?: string;
  icon: typeof Activity;
  tone?: string;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <Icon
          className={`h-4 w-4 ${tone === "danger" ? "text-rose-600" : tone === "success" ? "text-emerald-600" : "text-primary"}`}
        />
      </div>
      <div className="mt-2 text-[26px] font-semibold tracking-[-.5px]">{value}</div>
      {note && <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>}
    </div>
  );
}

function Dashboard({
  role,
  issues,
  settings,
  onReport,
  onIssue,
  onViewAll,
  onOpenMap,
  onOpenIntelligence,
}: {
  role: CivicRole;
  issues: CivicIssue[];
  settings: CivicSettings;
  onReport: () => void;
  onIssue: (id: string) => void;
  onViewAll: () => void;
  onOpenMap: () => void;
  onOpenIntelligence: () => void;
}) {
  const citizen = role === "citizen";
  const residentIssues = issues.filter((issue) => issue.citizen === "Rahul Sharma");
  const scopedIssues = citizen ? residentIssues : issues;
  const slaBreached = issues.filter(
    (issue) => getSlaStatus(issue, settings).status === "breached",
  ).length;
  const dueSoon = issues.filter(
    (issue) => getSlaStatus(issue, settings).status === "due-soon",
  ).length;
  const awaitingVerification = issues.filter(
    (issue) => issue.status === "AWAITING CITIZEN VERIFICATION",
  ).length;

  const stats = citizen
    ? [
        {
          label: "My reports",
          value: residentIssues.length,
          icon: FileText,
          note: "Shared across your workspace",
        },
        {
          label: "Open",
          value: residentIssues.filter((issue) => !["RESOLVED", "REJECTED"].includes(issue.status))
            .length,
          icon: AlertTriangle,
          note: "Needs municipal action",
          tone: "danger",
        },
        {
          label: "In progress",
          value: residentIssues.filter((issue) =>
            ["ASSIGNED", "IN PROGRESS"].includes(issue.status),
          ).length,
          icon: Activity,
          note: "Across response teams",
        },
        {
          label: "Resolved",
          value: residentIssues.filter((issue) => issue.status === "RESOLVED").length,
          icon: CheckCircle2,
          note: "Citizen-confirmed outcomes",
          tone: "success",
        },
      ]
    : [
        {
          label: "Total issues",
          value: issues.length,
          icon: FileText,
          note: "CivicPulse Demo Data",
        },
        {
          label: "Open",
          value: issues.filter((issue) => !["RESOLVED", "REJECTED"].includes(issue.status)).length,
          icon: AlertTriangle,
          note: "Across supported areas",
          tone: "danger",
        },
        {
          label: "In progress",
          value: issues.filter((issue) => ["ASSIGNED", "IN PROGRESS"].includes(issue.status))
            .length,
          icon: Activity,
          note: `${dueSoon} due soon`,
        },
        {
          label: "Resolved",
          value: issues.filter((issue) => issue.status === "RESOLVED").length,
          icon: CheckCircle2,
          note: "Demo register",
          tone: "success",
        },
      ];

  const rows = citizen
    ? scopedIssues.slice(0, 5)
    : scopedIssues.filter((issue) => !["RESOLVED", "REJECTED"].includes(issue.status)).slice(0, 6);

  return (
    <>
      <PageHeading
        eyebrow={
          citizen ? "Resident workspace • CivicPulse Demo Data" : "Civic operations • Demo Data"
        }
        title={citizen ? "Good morning, Rahul" : "Municipal operations"}
        subtitle={
          citizen
            ? "Here's what's happening with your civic reports."
            : "Monitor, prioritize and resolve civic infrastructure issues."
        }
        action={
          citizen ? (
            <Button className="h-10" onClick={onReport}>
              <Plus />
              Report an issue
            </Button>
          ) : (
            <div className="flex items-center gap-2 border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Ward-wide view <ChevronDown className="h-3.5 w-3.5" />
            </div>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Stat key={stat.label} {...stat} />
        ))}
      </div>

      {!citizen && (
        <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-3">
          <Stat
            label="Overdue"
            value={slaBreached}
            icon={Clock3}
            note="CivicPulse Demo SLA"
            tone="danger"
          />
          <Stat
            label="Due soon"
            value={dueSoon}
            icon={AlertTriangle}
            note="Within 20% of SLA"
            tone="danger"
          />
          <Stat
            label="Awaiting verification"
            value={awaitingVerification}
            icon={CheckCircle2}
            note="Citizen review"
            tone="success"
          />
        </div>
      )}

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <section className="min-w-0 border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-4 md:px-5">
            <div>
              <h2 className="text-[14px] font-semibold">
                {citizen ? "Recent reports" : "Priority queue"}
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {citizen
                  ? "Follow your latest issue updates"
                  : "Issues needing municipal attention"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onViewAll}>
              View all <ArrowRight />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {(citizen
                    ? ["Issue", "Location", "Priority", "Status"]
                    : ["Priority", "Issue", "Ward", "SLA", "Status"]
                  ).map((col) => (
                    <th key={col} className="px-4 py-3 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((issue) => (
                  <tr
                    key={issue.id}
                    onClick={() => onIssue(issue.id)}
                    className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/60"
                  >
                    {citizen ? (
                      <>
                        <td className="px-4 py-3">
                          <div className="text-[12px] font-semibold">{issue.title}</div>
                          <div className="mt-1 text-[10px] text-muted-foreground">{issue.id}</div>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-muted-foreground">
                          {issue.location}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={priorityStyle(issue.priority)}>{issue.priority}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={statusStyle(issue.status)}>
                            {prettyStatus(issue.status)}
                          </Badge>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <Badge className={priorityStyle(issue.priority)}>{issue.priority}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[12px] font-semibold">{issue.title}</div>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {issue.id} • {issue.location}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px]">{issue.ward}</td>
                        <td className="px-4 py-3 text-[11px] font-medium text-orange-700">
                          {issue.age === "18 min" ? "18h left" : "SLA active"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={statusStyle(issue.status)}>
                            {prettyStatus(issue.status)}
                          </Badge>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
            <span>
              Showing {rows.length} of {citizen ? 12 : "246"} issues
            </span>
            <Button variant="ghost" size="sm" onClick={onViewAll}>
              Open queue <ArrowRight />
            </Button>
          </div>
        </section>

        <section className="min-w-0 border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <div>
              <h2 className="text-[14px] font-semibold">Issues near you</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Kopargaon • Shrirampur • Shirdi
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label="Open map" onClick={onOpenMap}>
              <ArrowRight />
            </Button>
          </div>
          <CivicGeoMap issues={issues.slice(0, 15)} onIssue={onIssue} height="230px" />
          <div className="flex items-center justify-between p-4">
            <span className="text-[11px] text-muted-foreground">
              {issues.length} active civic reports
            </span>
            <Button variant="outline" size="sm" onClick={onOpenMap}>
              Explore map <MapPin />
            </Button>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-[13px] font-semibold">Civic pulse • Supported areas</h2>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
            Drainage complaints have increased{" "}
            <strong className="font-semibold text-foreground">42%</strong> this month. An inspection
            near Kopargaon Main Road may help prevent repeat flooding.
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground">
            <span>Potential recurring issue • Demo insight</span>
            <Button variant="link" className="h-auto p-0 text-[11px]" onClick={onOpenIntelligence}>
              View insights
            </Button>
          </div>
        </section>

        <section className="border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-[13px] font-semibold">Latest updates</h2>
          </div>
          {[
            { text: "Your report was assigned to Road Maintenance", time: "12 min ago" },
            { text: "A resolution is ready for your review", time: "1 hour ago" },
          ].map((item) => (
            <div
              key={item.text}
              className="mt-4 flex justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <span className="text-[11px]">{item.text}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{item.time}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
  variant?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-[170px] items-center truncate rounded-sm px-2 py-1 text-[9px] font-bold uppercase tracking-[.4px] ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

function ReportWizard({
  existingIssues = [],
  settings,
  onCancel,
  onTrack,
  onSubmit,
}: {
  existingIssues?: CivicIssue[];
  settings?: CivicSettings;
  onCancel: () => void;
  onTrack: () => void;
  onSubmit: (issue: CivicIssue) => void;
}) {
  const [step, setStep] = useState(0);
  const [submittedId, setSubmittedId] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Infrastructure");
  const [priority, setPriority] = useState<CivicIssue["priority"]>("High");
  const [department, setDepartment] = useState(departments[0] ?? "Road Maintenance");
  const [locationMeta, setLocationMeta] = useState<LocationMeta>(() => fallbackLocation());
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [image, setImage] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [linkedIssueId, setLinkedIssueId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysis | null>(null);
  const [aiErrorNotice, setAiErrorNotice] = useState<string | null>(null);
  const [detectedDuplicates, setDetectedDuplicates] = useState<DuplicateSuggestion[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const steps = ["Report", "Location", "AI analysis", "Review", "Submitted"];

  const handleUseGps = async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const coords = await getCurrentLocation();
      const resolved = await resolveLocation(coords.latitude, coords.longitude, "gps");
      setLocationMeta(resolved);
      toast.success(`Acquired location: ${resolved.area || resolved.city}`);
    } catch (err) {
      const msg =
        err instanceof LocationServiceError
          ? err.message
          : "Unable to retrieve your current location. Please select a location manually.";
      setLocationError(msg);
      toast.error(msg);
    } finally {
      setLocating(false);
    }
  };

  const handleMapLocationSelect = async (pos: MapPosition) => {
    setLocationError(null);
    try {
      const resolved = await resolveLocation(pos.latitude, pos.longitude, "manual");
      setLocationMeta(resolved);
      toast.success(`Selected on map: ${resolved.area || resolved.city}`);
    } catch {
      const nearest = civicAreas[0];
      setLocationMeta({
        latitude: pos.latitude,
        longitude: pos.longitude,
        address: pos.label ?? nearest.address,
        city: nearest.city,
        area: nearest.area,
        ward: nearest.ward,
        timestamp: new Date().toISOString(),
        source: "manual",
      });
    }
  };

  const analyze = async () => {
    if (!description.trim() && !image) {
      toast.error("Please add a description or a photo before analysis");
      return;
    }
    setAnalyzing(true);
    setAiErrorNotice(null);
    try {
      const locationContext = `${locationMeta.address}, ${locationMeta.city} (${locationMeta.ward})`;
      const result = await analyzeImage(
        image || undefined,
        description,
        settings?.aiMode,
        locationContext,
      );
      setAiResult(result);
      setCategory(result.category);
      setPriority(result.severity);
      setDepartment(result.department);

      // Check duplicates dynamically with current location & text
      const duplicates = detectDuplicates(
        {
          category: result.category,
          description: description || result.summary,
          latitude: locationMeta.latitude,
          longitude: locationMeta.longitude,
          location: locationMeta.address,
        },
        existingIssues,
        settings?.duplicateRadiusMeters ?? 800,
      );
      setDetectedDuplicates(duplicates);

      if (result.usedMock) {
        setAiErrorNotice(
          result.mockReason
            ? `DEMO AI / FALLBACK: ${result.mockReason}`
            : "DEMO AI / FALLBACK active (temporary AI failure, using advisory heuristic).",
        );
      } else {
        setAiErrorNotice(null);
      }
      setStep(1);
    } catch (err) {
      setAiErrorNotice(
        "DEMO AI / FALLBACK: Real AI analysis encountered a failure after retries. You can continue with manual triage.",
      );
      setStep(1);
    } finally {
      setAnalyzing(false);
    }
  };

  // Re-run duplicate detection dynamically whenever location, category, or description changes
  const runDuplicateScan = (
    newMeta: LocationMeta = locationMeta,
    cat: string = category,
    desc: string = description,
  ) => {
    const duplicates = detectDuplicates(
      {
        category: cat,
        description: desc,
        latitude: newMeta.latitude,
        longitude: newMeta.longitude,
        location: newMeta.address,
      },
      existingIssues,
      settings?.duplicateRadiusMeters ?? 800,
    );
    setDetectedDuplicates(duplicates);
  };

  useEffect(() => {
    if (step < 2) return;
    const timer = setTimeout(() => {
      runDuplicateScan(locationMeta, category, description);
    }, 200);
    return () => clearTimeout(timer);
  }, [category, description, locationMeta, step, existingIssues, settings?.duplicateRadiusMeters]);

  const submit = () => {
    const newId = `CIV-2026-${String(Date.now()).slice(-5)}`;
    setSubmittedId(newId);
    onSubmit({
      id: newId,
      title: description.length > 48 ? `${description.slice(0, 45)}…` : description || category,
      category,
      location: locationMeta.address,
      ward: locationMeta.ward,
      department,
      priority,
      status: "NEW",
      age: "Just now",
      citizen: "Rahul Sharma",
      description: description || `Reported ${category.toLowerCase()} condition.`,
      confidence: aiResult?.confidence ?? (aiResult?.usedMock ? 72 : 88),
      lat: locationMeta.latitude,
      left: 50,
      top: 50,
      latitude: locationMeta.latitude,
      longitude: locationMeta.longitude,
      address: locationMeta.address,
      city: locationMeta.city,
      area: locationMeta.area,
      createdAt: new Date().toISOString(),
      ...(image ? { image } : {}),
      aiSummary:
        aiResult?.summary ??
        `AI found a likely ${category.toLowerCase()} concern near ${locationMeta.address}.`,
      impact:
        aiResult?.impact ??
        (priority === "Critical"
          ? "Critical safety hazard requiring immediate attention."
          : priority === "High"
            ? "May disrupt local movement and public safety."
            : "Localized disruption reported by residents."),
      duplicateIds: linkedIssueId ? [linkedIssueId] : [],
      notes: [],
      timeline: defaultTimeline(),
    });
    setStep(4);
  };

  const loadImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (PNG, JPG, WebP) to continue");
      return;
    }
    // Validate maximum file size (15MB)
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image file is too large (maximum 15MB)");
      return;
    }

    // Resize/compress client-side to ensure responsive transmission
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1200;
        const maxHeight = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setImage(compressed);
        } else {
          setImage(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-auto max-w-[880px]">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" className="-ml-3 text-muted-foreground" onClick={onCancel}>
          <ArrowLeft />
          Back to overview
        </Button>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Secure civic reporting • AI Triage
        </span>
      </div>

      <PageHeading
        eyebrow="New civic report"
        title={step === 4 ? "Report submitted" : "Report an issue"}
        subtitle={
          step === 4
            ? "Your report is now part of the city response."
            : "Help your city understand what needs attention."
        }
      />

      <div className="mb-7 flex items-center">
        {steps.map((label, index) => (
          <div key={label} className="flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${step >= index ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {step > index ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={`hidden text-[10px] font-medium sm:block ${step >= index ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className={`mx-2 h-px flex-1 ${step > index ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <section className="border border-border bg-card p-5 md:p-7">
          <h2 className="text-[15px] font-semibold">What needs attention?</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            A photo and a few details help the AI and municipal teams respond quickly.
          </p>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              loadImage(event.dataTransfer.files[0]);
            }}
            className="mt-5 grid min-h-[210px] place-items-center border border-dashed border-border bg-background p-4 text-center"
          >
            {image ? (
              <div className="relative">
                <img
                  src={image}
                  alt="Selected civic issue"
                  className="max-h-[220px] max-w-full object-contain"
                />
                <div className="mt-3 flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Replace photo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImage("");
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    Remove photo
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center border border-border bg-card text-primary">
                  <ImagePlus className="h-5 w-5" />
                </div>
                <div className="mt-3 text-[13px] font-semibold">Add a photo of the issue</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Drop an image here or choose from your device (JPG, PNG up to 15MB)
                </div>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload />
                    Upload photo
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <Camera />
                    Use camera
                  </Button>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => loadImage(event.target.files?.[0])}
            />
          </div>

          <label className="mt-5 block text-[12px] font-semibold" htmlFor="issue-description">
            Describe the civic problem <span className="text-rose-600">*</span>
          </label>
          <Textarea
            id="issue-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Large pothole near the school entrance and multiple bikes are swerving dangerously."
            className="mt-2 min-h-[105px] resize-y bg-card text-[13px]"
          />
          <p className="mt-2 text-[10px] text-muted-foreground">
            Be specific about what you noticed and how it affects pedestrian and vehicle movement.
          </p>

          <div className="mt-6 flex justify-end">
            <Button className="h-10" disabled={analyzing} onClick={analyze}>
              {analyzing ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analyzing with AI…
                </>
              ) : (
                <>
                  Analyze with AI <Sparkles />
                </>
              )}
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="border border-border bg-card p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Confirm the issue location</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Supported areas: Kopargaon, Shrirampur, Shirdi. Click on the map or use GPS.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={locating}
              className="h-10 shrink-0"
              onClick={handleUseGps}
            >
              {locating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Acquiring GPS…
                </>
              ) : (
                <>
                  <LocateFixed />
                  Use My Current Location
                </>
              )}
            </Button>
          </div>

          {locationError && (
            <div className="mt-3 flex items-center gap-2 border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{locationError}</span>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Address / Landmark
            </label>
            <Input
              value={locationMeta.address}
              onChange={(event) => {
                const updated = {
                  ...locationMeta,
                  address: event.target.value,
                  source: "manual" as const,
                };
                setLocationMeta(updated);
                runDuplicateScan(updated);
              }}
              aria-label="Search or enter location"
              placeholder="e.g. Main Road, Kopargaon"
              className="h-10"
            />
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-muted-foreground">
                Select location on map (Click anywhere on map to update pin):
              </span>
              <span className="text-[10px] text-muted-foreground">
                Pin: {locationMeta.latitude.toFixed(4)}° N, {locationMeta.longitude.toFixed(4)}° E
              </span>
            </div>
            <CivicGeoMap
              selectedPosition={{
                latitude: locationMeta.latitude,
                longitude: locationMeta.longitude,
                label: locationMeta.address || "Selected report location",
              }}
              onLocationSelect={(pos) => {
                handleMapLocationSelect(pos);
                runDuplicateScan({
                  ...locationMeta,
                  latitude: pos.latitude,
                  longitude: pos.longitude,
                });
              }}
              height="280px"
              interactive={true}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground">
              Quick select demo area:
            </span>
            {civicAreas.slice(0, 3).map((area) => (
              <Button
                key={area.area}
                type="button"
                variant={locationMeta.area === area.area ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px]"
                onClick={() => {
                  setLocationError(null);
                  const selectedMeta: LocationMeta = {
                    latitude: area.latitude,
                    longitude: area.longitude,
                    address: area.address,
                    city: area.city,
                    area: area.area,
                    ward: area.ward,
                    timestamp: new Date().toISOString(),
                    source: "manual",
                  };
                  setLocationMeta(selectedMeta);
                  runDuplicateScan(selectedMeta);
                  toast.success(`Selected ${area.city} • ${area.area}`);
                }}
              >
                <MapPin className="h-3 w-3" />
                {area.city} ({area.area})
              </Button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "City", value: locationMeta.city },
              { label: "Ward", value: locationMeta.ward },
              { label: "Latitude", value: `${locationMeta.latitude.toFixed(4)}° N` },
              { label: "Longitude", value: `${locationMeta.longitude.toFixed(4)}° E` },
            ].map((item) => (
              <div key={item.label} className="border border-border p-3">
                <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1 truncate text-[11px] font-medium">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft />
              Back
            </Button>
            <Button onClick={() => setStep(2)}>
              Review AI analysis <ArrowRight />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="border border-border bg-card p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold">AI analysis • Review suggestions</h2>
                <Badge
                  variant={aiResult?.usedMock ? "secondary" : "default"}
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    aiResult?.usedMock
                      ? "border border-amber-300 bg-amber-100 text-amber-900"
                      : "border border-emerald-300 bg-emerald-100 text-emerald-900"
                  }`}
                >
                  {aiResult?.usedMock ? "DEMO AI / FALLBACK" : "Gemini Vision AI"}
                </Badge>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                AI recommendations are advisory only. All values are editable before submission.
              </p>
            </div>
            <span
              className={`flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold ${
                aiResult?.usedMock
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {aiResult?.usedMock
                ? `${aiResult?.confidence ?? 72}% (Fallback estimate)`
                : `${aiResult?.confidence ?? 0}% confidence`}
            </span>
          </div>

          {aiErrorNotice && (
            <div className="mt-3 flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>{aiErrorNotice}</span>
            </div>
          )}

          <div className="mt-5 grid gap-5 md:grid-cols-[.8fr_1.2fr]">
            {image ? (
              <img src={image} alt="Issue evidence" className="h-[210px] w-full object-cover" />
            ) : (
              <div className="civic-map grid h-[210px] place-items-center text-primary">
                <MapPin className="h-8 w-8" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Category (Citizen confirmed)",
                  value: category,
                  options: categories,
                  change: setCategory,
                  aiOriginal: aiResult?.category,
                },
                {
                  label: "Severity (Citizen confirmed)",
                  value: priority,
                  options: ["Critical", "High", "Medium", "Low"],
                  change: (value: string) => setPriority(value as CivicIssue["priority"]),
                  aiOriginal: aiResult?.severity,
                },
                {
                  label: "Department (Citizen confirmed)",
                  value: department,
                  options: departments,
                  change: setDepartment,
                  aiOriginal: aiResult?.department,
                },
              ].map((item) => (
                <label key={item.label} className="block">
                  <span className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                    <span>{item.label}</span>
                    {item.aiOriginal && item.aiOriginal !== item.value && (
                      <span className="text-[9px] text-primary">(AI: {item.aiOriginal})</span>
                    )}
                  </span>
                  <select
                    aria-label={item.label}
                    value={item.value}
                    onChange={(event) => item.change(event.target.value)}
                    className="mt-1 block h-10 w-full border border-input bg-background px-2 text-[11px] outline-none focus:border-primary"
                  >
                    {item.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}

              <div className="border border-border bg-accent/50 p-3">
                <div className="text-[9px] font-bold uppercase text-muted-foreground">
                  AI Assessment
                </div>
                <div className="mt-1.5 text-[11px] font-medium leading-tight">
                  {aiResult?.detectedProblem || category}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {aiResult?.reasoning || "Triage based on civic impact and safety factors."}
                </div>
              </div>
            </div>
          </div>

          <label className="mt-5 block text-[11px] font-semibold">Report description</label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 min-h-[85px] text-[12px]"
          />

          <div className="mt-4 border-l-2 border-primary bg-background px-4 py-3 text-[11px] leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground">AI summary: </span>
            {aiResult?.summary ?? `Analysis generated for this ${category.toLowerCase()} report.`}
            {aiResult?.impact && (
              <span className="block mt-1">
                <strong className="text-foreground">Impact: </strong>
                {aiResult.impact}
              </span>
            )}
          </div>

          {/* Dynamic Duplicate Detection Box */}
          {detectedDuplicates.length > 0 && (
            <div className="mt-5 border border-amber-300 bg-amber-50/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-amber-900">
                  <Layers3 className="h-4 w-4 text-amber-700" />
                  Nearby Similar Reports ({detectedDuplicates.length} found)
                </div>
                <span className="text-[10px] text-amber-800">
                  Radius: {settings?.duplicateRadiusMeters ?? 800} m
                </span>
              </div>
              <p className="mt-1 text-[11px] text-amber-900/80">
                You can link your report to an existing ticket to avoid duplicate municipal
                dispatches, or proceed and submit as a new complaint.
              </p>

              <div className="mt-3 space-y-2.5">
                {detectedDuplicates.map((dup) => {
                  const isLinked = linkedIssueId === dup.issueId;
                  const isHigh = dup.matchLevel === "high";
                  return (
                    <div
                      key={dup.issueId}
                      className={`flex flex-wrap items-center justify-between gap-3 border p-3 transition-colors ${
                        isLinked
                          ? "border-emerald-500 bg-emerald-50/90"
                          : isHigh
                            ? "border-rose-200 bg-background"
                            : "border-amber-200 bg-background"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold">
                          <span>{dup.issueId}</span>
                          <span className="text-muted-foreground">•</span>
                          <span>{dup.category}</span>
                          <Badge
                            className={`text-[9px] ${
                              isHigh
                                ? "border border-rose-300 bg-rose-100 text-rose-900"
                                : "border border-amber-300 bg-amber-100 text-amber-900"
                            }`}
                          >
                            {dup.similarity}% match •{" "}
                            {isHigh ? "Likely Duplicate" : "Possible Related Issue"}
                          </Badge>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {dup.location} • {dup.distance} away • Status: {prettyStatus(dup.status)}
                        </div>
                        {dup.reason && (
                          <div className="mt-1 text-[10px] font-medium text-amber-900/90">
                            Signals: {dup.reason}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isLinked ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-emerald-500 text-emerald-800 text-[11px] font-semibold"
                            onClick={() => {
                              setLinkedIssueId(null);
                              toast.info("Unlinked from ticket");
                            }}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            This is the same issue (Linked)
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-[11px]"
                            onClick={() => {
                              setLinkedIssueId(dup.issueId);
                              toast.success(`Linked to existing ticket ${dup.issueId}`);
                            }}
                          >
                            This is the same issue
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft />
              Location
            </Button>
            <Button
              onClick={() => {
                setConfirmed(true);
                setStep(3);
              }}
            >
              Confirm analysis <ArrowRight />
            </Button>
          </div>
          {linkedIssueId && (
            <p className="mt-3 text-right text-[10px] text-emerald-700 font-semibold">
              ✓ Will link to existing ticket {linkedIssueId}
            </p>
          )}
          {confirmed && <span className="sr-only">Analysis confirmed</span>}
        </section>
      )}

      {step === 3 && (
        <section className="border border-border bg-card p-5 md:p-7">
          <h2 className="text-[15px] font-semibold">Review your report</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Check the confirmed details before sending this to the municipal team.
          </p>

          <div className="mt-5 grid gap-5 sm:grid-cols-[220px_1fr]">
            {image ? (
              <img
                src={image}
                alt="Your uploaded civic issue"
                className="h-[170px] w-full object-cover"
              />
            ) : (
              <div className="civic-map grid h-[170px] place-items-center">
                <MapPin className="h-8 w-8 text-primary" />
              </div>
            )}
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge className={priorityStyle(priority)}>{priority} priority</Badge>
                <Badge className="bg-accent text-accent-foreground">
                  {aiResult?.confidence ?? 94}% AI confidence
                </Badge>
                {linkedIssueId && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                    Linked to {linkedIssueId}
                  </Badge>
                )}
              </div>
              <h3 className="mt-3 text-[15px] font-semibold">{category}</h3>
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {description || "No additional description provided."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                  <div className="text-[9px] uppercase text-muted-foreground">Location</div>
                  <div className="mt-1 text-[11px] font-medium">
                    {locationMeta.address} • {locationMeta.ward} ({locationMeta.city})
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-muted-foreground">Assigned team</div>
                  <div className="mt-1 text-[11px] font-medium">{department}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 border border-border p-4">
            <div className="flex items-center justify-between text-[12px] font-semibold">
              <span className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-primary" />
                Nearby Similar Reports
              </span>
              <span className="text-[10px] font-normal text-muted-foreground">
                CivicPulse Duplicate Detection
              </span>
            </div>
            {detectedDuplicates.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {detectedDuplicates.map((dup) => (
                  <div
                    key={dup.issueId}
                    className="flex items-center justify-between border border-border px-3 py-2 text-[11px]"
                  >
                    <span>
                      <strong>{dup.issueId}</strong> • {dup.category} ({dup.distance})
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {dup.similarity}% similarity • {prettyStatus(dup.status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">
                No duplicate reports detected within {settings?.duplicateRadiusMeters ?? 800}{" "}
                meters.
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft />
              Edit details
            </Button>
            <Button onClick={submit}>
              Submit civic report <ArrowRight />
            </Button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="border border-border bg-card px-5 py-10 text-center md:py-14">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <Check className="h-8 w-8" />
          </div>
          <div className="mt-5 text-[10px] font-bold uppercase tracking-[1.3px] text-emerald-700">
            Report received
          </div>
          <h2 className="mt-2 text-[24px] font-semibold">Your civic issue has been reported.</h2>
          <p className="mx-auto mt-2 max-w-[430px] text-[13px] leading-6 text-muted-foreground">
            The {department} team can now review your {category.toLowerCase()} report. We ll keep
            you updated as it moves forward.
          </p>

          <div className="mx-auto mt-7 max-w-[470px] border border-border bg-background p-4">
            <div className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              Complaint ID
            </div>
            <div className="mt-1 text-[21px] font-semibold tracking-[.3px]">{submittedId}</div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-4 text-[10px]">
              <div>
                <span className="block text-muted-foreground">Category</span>
                <span className="mt-1 block truncate font-semibold">{category.split(" /")[0]}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Location</span>
                <span className="mt-1 block truncate font-semibold">{locationMeta.address}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Status</span>
                <span className="mt-1 block font-semibold">New</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={onTrack}>
              Track report <ArrowRight />
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Back to overview
            </Button>
          </div>
          <p className="mt-5 text-[10px] text-muted-foreground">
            Your report is visible to the municipal response team.
          </p>
        </section>
      )}
    </div>
  );
}

function IssueQueue({
  role,
  issues,
  filter,
  onFilter,
  onIssue,
}: {
  role: CivicRole;
  issues: CivicIssue[];
  search: string;
  filter: string;
  onFilter: (filter: string) => void;
  onIssue: (id: string) => void;
}) {
  const citizenIssues =
    role === "citizen" ? issues.filter((issue) => issue.citizen === "Rahul Sharma") : issues;
  const rows = citizenIssues;

  return (
    <div>
      <PageHeading
        eyebrow={role === "citizen" ? "Resident workspace" : "Municipal operations"}
        title={role === "citizen" ? "My reports" : "Issue queue"}
        subtitle={
          role === "citizen"
            ? "Every report you have submitted, with live response updates."
            : "Triage, assign and resolve civic infrastructure issues."
        }
        action={
          role === "officer" ? (
            <Button variant="outline" className="h-10">
              <Download />
              Export queue
            </Button>
          ) : undefined
        }
      />

      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            {rows.length} reports in view
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              aria-label="Filter issues"
              value={filter}
              onChange={(event) => onFilter(event.target.value)}
              className="h-9 border border-input bg-background px-2 text-[11px]"
            >
              {[
                "All issues",
                "Open",
                "New",
                "Assigned",
                "In progress",
                "Awaiting citizen verification",
                "Resolved",
                "Reopened",
              ].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {["Issue", "Category", "Ward", "Priority", "Status", "Updated"].map((label) => (
                  <th key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((issue) => (
                <tr
                  key={issue.id}
                  className="cursor-pointer border-b border-border/70 hover:bg-muted/60"
                  onClick={() => onIssue(issue.id)}
                >
                  <td className="px-4 py-3">
                    <div className="text-[12px] font-semibold">{issue.title}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {issue.id} • {issue.location}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">{issue.category}</td>
                  <td className="px-4 py-3 text-[11px]">{issue.ward}</td>
                  <td className="px-4 py-3">
                    <Badge className={priorityStyle(issue.priority)}>{issue.priority}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={statusStyle(issue.status)}>
                      {prettyStatus(issue.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-muted-foreground">{issue.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!rows.length && (
          <div className="p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-[13px] font-semibold">No reports match this view</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Try a different status filter or search term.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function IssueDetail({
  issue,
  role,
  isNew,
  onBack,
  onStatus,
  onUpdate,
}: {
  issue: CivicIssue;
  role: CivicRole;
  isNew: boolean;
  onBack: () => void;
  onStatus: (status: CivicStatus) => void;
  onUpdate: (patch: Partial<CivicIssue>) => void;
}) {
  const [note, setNote] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState(issue.resolutionNotes ?? "");
  const [beforeImage, setBeforeImage] = useState(issue.beforeImage ?? "");
  const [afterImage, setAfterImage] = useState(issue.afterImage ?? "");
  const canManage = role !== "citizen";
  const timeline = issue.timeline ?? [];

  const saveNote = () => {
    if (!note.trim()) return;
    onUpdate({ notes: [...(issue.notes ?? []), note.trim()] });
    setNote("");
    toast.success("Note added to the issue");
  };

  const saveResolution = () => {
    onUpdate({ resolutionNotes, beforeImage, afterImage });
    onStatus("AWAITING CITIZEN VERIFICATION");
    toast.success("Resolution submitted for citizen verification");
  };

  const loadEvidence =
    (setter: (value: string) => void, field: "beforeImage" | "afterImage") => (file?: File) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Choose an image file");
        return;
      }
      const url = URL.createObjectURL(file);
      setter(url);
      onUpdate({ [field]: url });
    };

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" className="-ml-3 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          Back to issue list
        </Button>
        {isNew && (
          <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800">
            Just submitted
          </span>
        )}
      </div>

      <PageHeading
        eyebrow={`${issue.id} • ${issue.ward}`}
        title={issue.title}
        subtitle={`${issue.location} • Reported by ${issue.citizen}`}
        action={<Badge className={statusStyle(issue.status)}>{prettyStatus(issue.status)}</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-6">
          <section className="border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-semibold">Issue overview</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Citizen report and AI-assisted triage
                </p>
              </div>
              <Badge className={priorityStyle(issue.priority)}>{issue.priority} priority</Badge>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
              {issue.image ? (
                <img
                  src={issue.image}
                  alt="Citizen evidence"
                  className="h-[180px] w-full object-cover"
                />
              ) : (
                <div className="civic-map grid h-[180px] place-items-center">
                  <ImagePlus className="h-8 w-8 text-primary/60" />
                </div>
              )}
              <div>
                <div className="text-[13px] leading-6">{issue.description}</div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-[11px]">
                  <div>
                    <span className="block text-muted-foreground">Category</span>
                    <strong className="mt-1 block">{issue.category}</strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Department</span>
                    <strong className="mt-1 block">{issue.department}</strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Coordinates</span>
                    <strong className="mt-1 block">
                      {issue.lat.toFixed(4)}°, {(issue.longitude ?? 73.8567).toFixed(4)}°
                    </strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">AI confidence</span>
                    <strong className="mt-1 block">{issue.confidence}%</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 border-l-2 border-primary bg-background px-4 py-3 text-[11px] leading-5 text-muted-foreground">
              <span className="font-semibold text-foreground">AI summary: </span>
              {issue.aiSummary ?? "AI triage summary is available for this demo report."}{" "}
              {issue.impact && (
                <>
                  <span className="font-semibold text-foreground">Impact: </span>
                  {issue.impact}
                </>
              )}
            </div>
          </section>

          <section className="border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold">Status timeline</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A shared record across citizen and authority views
                </p>
              </div>
              <FileCheck className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-5 space-y-0">
              {timeline.map((event, index) => (
                <div key={`${event.label}-${index}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full ${event.done ? "bg-primary text-primary-foreground" : "border border-border bg-background text-muted-foreground"}`}
                    >
                      {event.done ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    {index < timeline.length - 1 && (
                      <span className={`h-9 w-px ${event.done ? "bg-primary/40" : "bg-border"}`} />
                    )}
                  </div>
                  <div className="pb-4">
                    <div className="text-[12px] font-semibold">{event.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {event.detail} • {event.at}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {issue.duplicateIds?.length ? (
            <section className="border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <Layers3 className="h-4 w-4 text-primary" />
                Similar nearby reports
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Possible duplicates detected by the demo AI analysis.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {issue.duplicateIds.map((id) => (
                  <span key={id} className="border border-border px-2 py-1.5 text-[10px]">
                    {id}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          {issue.status === "AWAITING CITIZEN VERIFICATION" && role === "citizen" && (
            <section className="border border-violet-200 bg-violet-50 p-5">
              <div className="flex items-start gap-3">
                <CheckCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
                <div>
                  <h2 className="text-[14px] font-semibold text-violet-950">
                    Has this issue actually been resolved?
                  </h2>
                  <p className="mt-1 text-[11px] leading-5 text-violet-900/70">
                    The municipal team submitted a resolution. Your response updates the same issue
                    for the city team.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="bg-violet-700 hover:bg-violet-800"
                      onClick={() => {
                        onStatus("RESOLVED");
                        toast.success("Thanks • issue marked resolved");
                      }}
                    >
                      Yes, resolved
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onStatus("REOPENED");
                        toast.success("Issue reopened for municipal follow-up");
                      }}
                    >
                      No, still exists
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {canManage && (
            <section className="border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-primary" />
                <h2 className="text-[14px] font-semibold">Authority controls</h2>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-semibold text-muted-foreground">
                  Assign department
                  <select
                    value={issue.department}
                    onChange={(event) =>
                      onUpdate({
                        department: event.target.value,
                        status: issue.status === "NEW" ? "ASSIGNED" : issue.status,
                      })
                    }
                    className="mt-1 h-9 w-full border border-input bg-background px-2 text-[11px] text-foreground"
                  >
                    {departments.map((department) => (
                      <option key={department}>{department}</option>
                    ))}
                  </select>
                </label>

                <label className="text-[10px] font-semibold text-muted-foreground">
                  Assign officer
                  <select
                    value={issue.assignedOfficer ?? ""}
                    onChange={(event) =>
                      onUpdate({
                        assignedOfficer: event.target.value,
                        status: event.target.value ? "ASSIGNED" : issue.status,
                      })
                    }
                    className="mt-1 h-9 w-full border border-input bg-background px-2 text-[11px] text-foreground"
                  >
                    <option value="">Unassigned</option>
                    {officers.map((officer) => (
                      <option key={officer}>{officer}</option>
                    ))}
                  </select>
                </label>

                <label className="text-[10px] font-semibold text-muted-foreground">
                  Priority
                  <select
                    value={issue.priority}
                    onChange={(event) =>
                      onUpdate({ priority: event.target.value as CivicIssue["priority"] })
                    }
                    className="mt-1 h-9 w-full border border-input bg-background px-2 text-[11px] text-foreground"
                  >
                    {["Critical", "High", "Medium", "Low"].map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </label>

                <label className="text-[10px] font-semibold text-muted-foreground">
                  Status
                  <select
                    value={issue.status}
                    onChange={(event) => onStatus(event.target.value as CivicStatus)}
                    className="mt-1 h-9 w-full border border-input bg-background px-2 text-[11px] text-foreground"
                  >
                    {[
                      "NEW",
                      "UNDER REVIEW",
                      "ASSIGNED",
                      "IN PROGRESS",
                      "AWAITING CITIZEN VERIFICATION",
                      "RESOLVED",
                      "REOPENED",
                      "REJECTED",
                    ].map((status) => (
                      <option key={status} value={status}>
                        {prettyStatus(status as CivicStatus)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-4 block text-[10px] font-semibold text-muted-foreground">
                Add internal note
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Record an inspection update or request for information…"
                  className="mt-1 min-h-[75px] w-full border border-input bg-background p-2 text-[11px] font-normal text-foreground outline-none focus:border-primary"
                />
              </label>

              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={saveNote}>
                  <MessageSquare />
                  Add note
                </Button>
              </div>

              {(issue.notes ?? []).length > 0 && (
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  {issue.notes?.map((item, index) => (
                    <div key={`${item}-${index}`} className="flex gap-2 text-[11px]">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {canManage && (
            <section className="border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <HardHat className="h-4 w-4 text-primary" />
                <h2 className="text-[14px] font-semibold">Resolution evidence</h2>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Submit before/after evidence and ask the citizen to verify.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Before image", beforeImage, setBeforeImage, "beforeImage"],
                  ["After image", afterImage, setAfterImage, "afterImage"],
                ].map(([label, image, setter, field]) => (
                  <label
                    key={label as string}
                    className="border border-dashed border-border p-3 text-center"
                  >
                    <span className="block text-[10px] font-semibold text-muted-foreground">
                      {label as string}
                    </span>
                    {image ? (
                      <img
                        src={image as string}
                        alt={label as string}
                        className="mt-2 h-24 w-full object-cover"
                      />
                    ) : (
                      <Paperclip className="mx-auto my-5 h-5 w-5 text-muted-foreground" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-2 w-full text-[10px]"
                      onChange={(event) =>
                        loadEvidence(
                          setter as (value: string) => void,
                          field as "beforeImage" | "afterImage",
                        )(event.target.files?.[0])
                      }
                    />
                  </label>
                ))}
              </div>

              <label className="mt-4 block text-[10px] font-semibold text-muted-foreground">
                Resolution notes
                <textarea
                  value={resolutionNotes}
                  onChange={(event) => setResolutionNotes(event.target.value)}
                  placeholder="Explain what was fixed and when."
                  className="mt-1 min-h-[75px] w-full border border-input bg-background p-2 text-[11px] font-normal text-foreground outline-none focus:border-primary"
                />
              </label>

              <Button className="mt-3 w-full" onClick={saveResolution}>
                <CheckCheck />
                Submit for citizen verification
              </Button>
            </section>
          )}

          {issue.resolutionNotes && !canManage && (
            <section className="border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                Municipal resolution
              </div>
              <p className="mt-2 text-[11px] leading-5 text-emerald-900/80">
                {issue.resolutionNotes}
              </p>
            </section>
          )}

          <section className="border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold">Location</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {issue.location} • {issue.ward}
                </p>
              </div>
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-4 overflow-hidden border border-border">
              <CivicGeoMap
                issues={[issue]}
                selectedPosition={{
                  latitude: issue.latitude ?? issue.lat,
                  longitude: issue.longitude ?? 74.55,
                  label: `${issue.id}: ${issue.title}`,
                }}
                height="190px"
                interactive={false}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function CivicMap({
  issues,
  onIssue,
}: {
  issues: CivicIssue[];
  search: string;
  onIssue: (id: string) => void;
}) {
  const [category, setCategory] = useState("All categories");
  const [severity, setSeverity] = useState("All severity");
  const [status, setStatus] = useState("All statuses");
  const [ward, setWard] = useState("All wards");

  const filtered = issues.filter(
    (issue) =>
      (category === "All categories" || issue.category === category) &&
      (severity === "All severity" || issue.priority === severity) &&
      (status === "All statuses" || issue.status === status) &&
      (ward === "All wards" || issue.ward === ward),
  );

  return (
    <div>
      <PageHeading
        eyebrow="Citywide view"
        title="Civic map"
        subtitle="Explore active reports, recurring hotspots and ward-level response."
        action={
          <Button variant="outline" className="h-10">
            <Download />
            Download view
          </Button>
        }
      />

      <section className="border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {[
            [
              "Category",
              category,
              setCategory,
              ["All categories", ...Array.from(new Set(issues.map((issue) => issue.category)))],
            ],
            [
              "Severity",
              severity,
              setSeverity,
              ["All severity", "Critical", "High", "Medium", "Low"],
            ],
            [
              "Status",
              status,
              setStatus,
              [
                "All statuses",
                "NEW",
                "ASSIGNED",
                "IN PROGRESS",
                "AWAITING CITIZEN VERIFICATION",
                "RESOLVED",
                "REOPENED",
              ],
            ],
            ["Ward", ward, setWard, ["All wards", ...wards]],
          ].map(([label, value, setter, options]) => (
            <label
              key={label as string}
              className="text-[10px] font-semibold text-muted-foreground"
            >
              {label as string}
              <select
                value={value as string}
                onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                className="ml-2 h-8 border border-input bg-background px-2 text-[11px] font-normal text-foreground"
              >
                {(options as string[]).map((option) => (
                  <option key={option} value={option}>
                    {option.includes("_") ? prettyStatus(option as CivicStatus) : option}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="mt-4 overflow-hidden border border-border">
          <CivicGeoMap issues={filtered} onIssue={onIssue} height="540px" />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-3 py-2 text-[10px] shadow-sm">
          <span className="font-semibold">{filtered.length} visible reports</span>
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-rose-600" />
              Critical
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-orange-500" />
              High
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-amber-500" />
              Medium
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-emerald-600" />
              Low
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

function Intelligence({ issues }: { issues: CivicIssue[] }) {
  const resolved = issues.filter((issue) => issue.status === "RESOLVED").length;
  const open = issues.filter((issue) => !["RESOLVED", "REJECTED"].includes(issue.status)).length;
  const categoryCounts = issues.reduce<Record<string, number>>(
    (counts, issue) => ({ ...counts, [issue.category]: (counts[issue.category] ?? 0) + 1 }),
    {},
  );
  const wardCounts = issues.reduce<Record<string, number>>(
    (counts, issue) => ({ ...counts, [issue.ward]: (counts[issue.ward] ?? 0) + 1 }),
    {},
  );
  const maxCategory = Math.max(...Object.values(categoryCounts), 1);

  return (
    <div>
      <PageHeading
        eyebrow="Decision support • Demo data"
        title="Civic intelligence"
        subtitle="Patterns and operational signals from the shared issue register."
        action={
          <Button variant="outline" className="h-10">
            <Download />
            Export insights
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total reports" value={issues.length} icon={FileText} note="Across 18 wards" />
        <Stat
          label="Open reports"
          value={open}
          icon={AlertTriangle}
          note="Need municipal action"
          tone="danger"
        />
        <Stat
          label="Resolved"
          value={resolved}
          icon={CheckCircle2}
          note="Citizen-confirmed outcomes"
          tone="success"
        />
        <Stat
          label="Resolution rate"
          value={`${Math.round((resolved / Math.max(issues.length, 1)) * 100)}%`}
          icon={Target}
          note="Current demo register"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <section className="border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Category distribution</h2>
          </div>
          <div className="mt-5 space-y-3">
            {Object.entries(categoryCounts)
              .slice(0, 7)
              .map(([label, count]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="h-2 bg-muted">
                    <div
                      className="h-2 bg-primary"
                      style={{ width: `${(count / maxCategory) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </section>

        <section className="border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Monthly trends</h2>
          </div>
          <div className="mt-5 flex h-[150px] items-end gap-3 border-b border-l border-border px-3 pb-0 pt-5">
            {[42, 58, 49, 66, 74, 88].map((value, index) => (
              <div key={index} className="flex h-full flex-1 flex-col justify-end gap-2">
                <div
                  className="bg-primary/75"
                  style={{ height: `${value}%` }}
                  title={`${value} reports`}
                />
                <span className="text-center text-[9px] text-muted-foreground">
                  {["Apr", "May", "Jun", "Jul", "Aug", "Sep"][index]}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">
            Reports increased 18% over the last three demo months.
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Proactive insights</h2>
          </div>
          <div className="mt-4 space-y-3">
            {[
              "Multiple road damage reports have appeared in Ward 04.",
              "Garbage overflow reports increased this month.",
              "Streetlight complaints are recurring near this location.",
            ].map((insight) => (
              <div
                key={insight}
                className="border-l-2 border-primary bg-background px-3 py-2 text-[11px] leading-5"
              >
                {insight}
                <div className="mt-1 text-[9px] text-muted-foreground">
                  Demo insight • review with local context
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-primary" />
            <h2 className="text-[14px] font-semibold">Recurring issues by ward</h2>
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(wardCounts)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([ward, count]) => (
                <div
                  key={ward}
                  className="flex items-center justify-between border-b border-border pb-2 text-[11px]"
                >
                  <span>{ward}</span>
                  <span className="font-semibold">
                    {count} reports{" "}
                    <ChevronRight className="ml-1 inline h-3 w-3 text-muted-foreground" />
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminDashboard({
  issues,
  settings: _settings,
  onSave: _onSave,
}: {
  issues: CivicIssue[];
  settings?: CivicSettings;
  onSave?: (settings: CivicSettings) => void;
}) {
  const adminItems = [
    { label: "Users", value: "248", icon: UsersRound },
    { label: "Departments", value: departments.length, icon: Building2 },
    { label: "Wards", value: wards.length, icon: MapPin },
    { label: "Categories", value: 7, icon: Layers3 },
  ];

  return (
    <div>
      <PageHeading
        eyebrow="Administration"
        title="Manage city"
        subtitle="Configure the demo workspace and review operational controls."
        action={
          <Button className="h-10">
            <Settings2 />
            Save settings
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {adminItems.map(({ label, value, icon: Icon }) => (
          <div key={label} className="border border-border bg-card p-4">
            <Icon className="h-4 w-4 text-primary" />
            <div className="mt-3 text-[24px] font-semibold">{value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="border border-border bg-card p-5">
          <h2 className="text-[14px] font-semibold">Service configuration</h2>
          <div className="mt-4 space-y-3">
            {[
              ["Default SLA for high priority", "24 hours"],
              ["Citizen notifications", "Enabled"],
              ["AI confidence threshold", "85%"],
              ["Duplicate radius", "500 m"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-border pb-3 text-[11px]"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-border bg-card p-5">
          <h2 className="text-[14px] font-semibold">Audit activity</h2>
          <div className="mt-4 space-y-3">
            {[
              ["Municipal Officer", "Assigned CIV-2026-00124", "12 min ago"],
              ["City Administrator", "Updated SLA settings", "1 hour ago"],
              ["AI triage", "Linked 3 similar reports", "3 hours ago"],
            ].map(([actor, action, time]) => (
              <div key={action} className="flex items-start gap-3 border-b border-border pb-3">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-accent text-primary">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold">{action}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{actor}</div>
                </div>
                <span className="text-[9px] text-muted-foreground">{time}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold">Register health</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Centralized demo state used across dashboards, map and analytics.
            </p>
          </div>
          <Badge className="bg-emerald-50 text-emerald-700">{issues.length} linked issues</Badge>
        </div>
      </div>
    </div>
  );
}

function Notifications({
  items,
  onRead,
}: {
  items: typeof initialNotifications;
  onRead: (id: number) => void;
}) {
  return (
    <div>
      <PageHeading
        eyebrow="Updates"
        title="Notifications"
        subtitle="Stay informed about assignments, resolutions and city activity."
        action={
          <Button
            variant="outline"
            className="h-10"
            onClick={() => items.forEach((item) => onRead(item.id))}
          >
            <CheckCheck />
            Mark all read
          </Button>
        }
      />

      <section className="border border-border bg-card">
        {items.map((item) => (
          <button
            key={item.id}
            className={`flex w-full items-start gap-3 border-b border-border p-5 text-left last:border-0 hover:bg-muted/50 ${item.unread ? "bg-accent/20" : ""}`}
            onClick={() => onRead(item.id)}
          >
            <span
              className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full ${item.unread ? "bg-accent text-primary" : "bg-muted text-muted-foreground"}`}
            >
              <Bell className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold">{item.title}</span>
              <span className="mt-1 block text-[10px] text-muted-foreground">{item.time}</span>
            </span>
            {item.unread && <span className="mt-2 h-2 w-2 rounded-full bg-orange-500" />}
          </button>
        ))}
      </section>
    </div>
  );
}
