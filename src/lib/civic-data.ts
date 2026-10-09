export type CivicRole = "citizen" | "officer" | "admin";

export type CivicStatus =
  | "NEW"
  | "UNDER REVIEW"
  | "ASSIGNED"
  | "IN PROGRESS"
  | "AWAITING CITIZEN VERIFICATION"
  | "RESOLVED"
  | "REOPENED"
  | "REJECTED";

export type CivicTimelineEvent = {
  label: string;
  detail: string;
  at: string;
  done: boolean;
};

export type CivicIssue = {
  id: string;
  title: string;
  category: string;
  location: string;
  ward: string;
  department: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  status: CivicStatus;
  age: string;
  citizen: string;
  description: string;
  confidence: number;
  lat: number;
  left: number;
  top: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
  area?: string;
  createdAt?: string;
  image?: string;
  aiSummary?: string;
  impact?: string;
  duplicateIds?: string[];
  assignedOfficer?: string;
  notes?: string[];
  resolutionNotes?: string;
  beforeImage?: string;
  afterImage?: string;
  timeline?: CivicTimelineEvent[];
};

export type CivicSettings = {
  slaHours: Record<CivicIssue["priority"], number>;
  departments: string[];
  categories: string[];
  enabledPriorities: CivicIssue["priority"][];
  notificationsEnabled: boolean;
  aiMode: "mock" | "real";
  aiConfidenceThreshold: number;
  duplicateRadiusMeters: number;
};

export const departments = [
  "Road Maintenance",
  "Waste Management",
  "Water Supply",
  "Drainage",
  "Electrical",
  "Parks & Gardens",
  "Traffic & Signage",
  "Infrastructure",
  "Sanitation",
];

export const categories = [
  "Pothole / Road Damage",
  "Garbage / Waste",
  "Water Leakage",
  "Drainage",
  "Broken Streetlight",
  "Fallen Tree",
  "Damaged Signage",
  "Other Infrastructure",
];

export const officers = [
  "Priya Nair",
  "Vikram Joshi",
  "Neha Kulkarni",
  "Arjun Mehta",
  "Sonal Patil",
];

export const wards = Array.from(
  { length: 18 },
  (_, index) => `Ward ${String(index + 1).padStart(2, "0")}`,
);

export const civicAreas = [
  {
    city: "Kopargaon",
    area: "Main Road",
    address: "Main Road, Kopargaon, Maharashtra",
    latitude: 19.8826,
    longitude: 74.4769,
    ward: "Ward K-04",
  },
  {
    city: "Shrirampur",
    area: "Station Road",
    address: "Station Road, Shrirampur, Maharashtra",
    latitude: 19.6183,
    longitude: 74.6574,
    ward: "Ward S-02",
  },
  {
    city: "Shirdi",
    area: "Temple Road",
    address: "Temple Road, Shirdi, Maharashtra",
    latitude: 19.7667,
    longitude: 74.4777,
    ward: "Ward D-03",
  },
  {
    city: "Kopargaon",
    area: "Market Area",
    address: "Market Area, Kopargaon, Maharashtra",
    latitude: 19.8891,
    longitude: 74.4812,
    ward: "Ward K-06",
  },
  {
    city: "Shrirampur",
    area: "Nehru Chowk",
    address: "Nehru Chowk, Shrirampur, Maharashtra",
    latitude: 19.6114,
    longitude: 74.6521,
    ward: "Ward S-05",
  },
  {
    city: "Shirdi",
    area: "Nagar-Manmad Road",
    address: "Nagar-Manmad Road, Shirdi, Maharashtra",
    latitude: 19.7732,
    longitude: 74.4931,
    ward: "Ward D-07",
  },
] as const;

export const defaultCivicSettings: CivicSettings = {
  slaHours: { Critical: 24, High: 48, Medium: 72, Low: 168 },
  departments: [...departments],
  categories: [...categories],
  enabledPriorities: ["Critical", "High", "Medium", "Low"],
  notificationsEnabled: true,
  aiMode: "real",
  aiConfidenceThreshold: 85,
  duplicateRadiusMeters: 800,
};

const titles = [
  "Large pothole near school entrance",
  "Overflowing community bin",
  "Streetlight out on main road",
  "Water leaking onto footpath",
  "Blocked storm drain",
  "Damaged road surface",
  "Fallen tree blocking lane",
  "Roadside waste accumulation",
  "Broken pavement tiles",
  "Low water pressure reported",
];

const statuses: CivicStatus[] = [
  "NEW",
  "UNDER REVIEW",
  "ASSIGNED",
  "IN PROGRESS",
  "AWAITING CITIZEN VERIFICATION",
  "RESOLVED",
  "REOPENED",
];

const priorities: CivicIssue["priority"][] = [
  "Critical",
  "High",
  "High",
  "Medium",
  "Medium",
  "Low",
];

export function createDemoIssues(): CivicIssue[] {
  return Array.from({ length: 100 }, (_, index) => {
    const n = index + 1;
    const title = titles[index % titles.length] ?? titles[0] ?? "Civic issue";
    const category = categories[index % categories.length] ?? categories[0] ?? "Infrastructure";
    const area = civicAreas[index % civicAreas.length] ?? civicAreas[0];
    const location = area.address;
    const department =
      departments[index % departments.length] ?? departments[0] ?? "Infrastructure";
    const priority = priorities[index % priorities.length] ?? "Medium";
    const status =
      index === 4
        ? "AWAITING CITIZEN VERIFICATION"
        : (statuses[(index * 3) % statuses.length] ?? "NEW");
    const citizen =
      ["Rahul Sharma", "Ananya Desai", "Aarav Kulkarni", "Meera Joshi", "Ishaan Patil"][
        index % 5
      ] ?? "Rahul Sharma";

    return {
      id: `CIV-2026-${String(124 - index).padStart(5, "0")}`,
      title,
      category,
      location,
      ward: area.ward,
      department,
      priority,
      status,
      age: index === 0 ? "18 min" : `${((n * 3) % 47) + 1}h`,
      citizen,
      description: `${title} reported by a nearby resident. The issue is affecting daily movement and needs municipal attention.`,
      confidence: 88 + ((index * 7) % 11),
      lat: area.latitude + ((index % 5) - 2) * 0.0008,
      left: 10 + ((index * 29) % 80),
      top: 12 + ((index * 37) % 70),
      latitude: area.latitude + ((index % 5) - 2) * 0.0008,
      longitude: area.longitude + ((index % 7) - 3) * 0.0007,
      address: area.address,
      city: area.city,
      area: area.area,
      createdAt: new Date(Date.now() - ((index % 14) + 1) * 60 * 60 * 1000).toISOString(),
      aiSummary: `${title} detected from the citizen description and nearby issue history.`,
      impact:
        index % 3 === 0
          ? "May affect road safety and daily movement."
          : "Localized disruption reported by residents.",
      duplicateIds:
        index % 5 === 0
          ? [`CIV-2026-${String(124 - Math.min(index + 1, 99)).padStart(5, "0")}`]
          : [],
      ...(index % 4 === 0
        ? { assignedOfficer: officers[index % officers.length] ?? officers[0] ?? "Unassigned" }
        : {}),
      notes: index % 4 === 0 ? ["Demo triage note: inspect during the next ward sweep."] : [],
      ...(index === 4
        ? {
            resolutionNotes: "Road surface repaired and debris cleared. Please confirm the result.",
          }
        : {}),
      timeline: [
        {
          label: "Report submitted",
          detail: "Citizen report received",
          at: `${(index % 8) + 1}h ago`,
          done: true,
        },
        {
          label: "AI triage complete",
          detail: `${category} • ${priority}`,
          at: `${(index % 7) + 1}h ago`,
          done: true,
        },
        {
          label: "Municipal review",
          detail: index % 3 === 0 ? "Assigned to response team" : "Awaiting assignment",
          at: index % 3 === 0 ? "Today" : "Next",
          done: index % 3 === 0,
        },
        {
          label: "Resolution",
          detail: index === 4 ? "Ready for citizen verification" : "Not submitted",
          at: index === 4 ? "Today" : "Pending",
          done: index === 4,
        },
      ],
    };
  });
}

export const initialNotifications = [
  {
    id: 1,
    title: "Your pothole report was assigned to Road Maintenance.",
    time: "12 min ago",
    unread: true,
  },
  { id: 2, title: "Resolution submitted for CIV-2026-00118.", time: "1 hour ago", unread: true },
  { id: 3, title: "New high-priority road issue in Ward 12.", time: "3 hours ago", unread: false },
];
