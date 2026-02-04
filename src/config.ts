import { z } from "zod";

const configSchema = z.object({
  port: z.number().default(3000),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),
  apiKey: z.string().min(1, "API_KEY is required"),

  evergreen: z.object({
    email: z.string().email("EVERGREEN_EMAIL must be a valid email"),
    password: z.string().min(1, "EVERGREEN_PASSWORD is required"),
    preAuthToken: z.string().default("de0d01e2fe6b212417d2514bc34a338f"),
  }),

  cron: z.object({
    schedule: z.string().default("*/15 * * * *"),
    fetchDaysAhead: z.number().min(1).max(14).default(7),
  }),

  cache: z.object({
    ttlMinutes: z.number().min(1).default(20),
    staleServeMinutes: z.number().min(1).default(60),
  }),

  timezone: z.string().default("Pacific/Auckland"),

  alert: z.object({
    enabled: z.boolean().default(false),
    smtp: z.object({
      host: z.string().default(""),
      port: z.number().default(465),
      user: z.string().default(""),
      pass: z.string().default(""),
    }),
    from: z.string().default(""),
    to: z.array(z.string().email()).default([]),
    cooldownMinutes: z.number().min(1).default(30),
  }),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const rawConfig = {
    port: parseInt(process.env.PORT || "3000"),
    nodeEnv: process.env.NODE_ENV || "development",
    apiKey: process.env.API_KEY || "",

    evergreen: {
      email: process.env.EVERGREEN_EMAIL || "",
      password: process.env.EVERGREEN_PASSWORD || "",
      preAuthToken: "de0d01e2fe6b212417d2514bc34a338f",
    },

    cron: {
      schedule: process.env.CRON_SCHEDULE || "*/15 * * * *",
      fetchDaysAhead: parseInt(process.env.FETCH_DAYS_AHEAD || "7"),
    },

    cache: {
      ttlMinutes: parseInt(process.env.CACHE_TTL_MINUTES || "20"),
      staleServeMinutes: parseInt(process.env.STALE_SERVE_MINUTES || "60"),
    },

    timezone: process.env.TZ || "Pacific/Auckland",

    alert: {
      enabled: !!process.env.SMTP_HOST,
      smtp: {
        host: process.env.SMTP_HOST || "",
        port: parseInt(process.env.SMTP_PORT || "465"),
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
      from: process.env.SMTP_USER || "",
      to: (process.env.EMAIL_TO || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
      cooldownMinutes: parseInt(process.env.ALERT_COOLDOWN_MINUTES || "30"),
    },
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error("Configuration validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

// Static venue data
export const VENUES = [
  {
    id: "active-bond" as const,
    name: "Active - Bond Crescent",
    address: "47 Bond Crescent, Forrest Hill, Auckland 0620",
    provider: "active" as const,
  },
  {
    id: "active-corinthian" as const,
    name: "Active - Corinthian Dr.",
    address: "20 Corinthian Drive, Albany, Auckland 0632",
    provider: "active" as const,
  },
  {
    id: "evergreen" as const,
    name: "Evergreen Badminton",
    address: "22B Corinthian Drive, Albany, Auckland 0632",
    provider: "evergreen" as const,
  },
];

// Time slot configuration
export const SLOT_START_HOUR = 6; // 06:00
export const SLOT_END_HOUR = 22; // 22:00 (last slot)

// Generate array of time slots: ["06:00", "07:00", ..., "22:00"]
export const TIME_SLOTS: string[] = [];
for (let hour = SLOT_START_HOUR; hour <= SLOT_END_HOUR; hour++) {
  TIME_SLOTS.push(`${hour.toString().padStart(2, "0")}:00`);
}
