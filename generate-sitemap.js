// generate-sitemap.js
// Run this script in GitHub Actions to generate sitemap
// Uses Appwrite SDK for reliable cursor pagination
// Includes static pages, category/location SEO pages, and dynamic job URLs

const fs = require("fs");
const path = require("path");
const { Client, Databases, Query } = require("node-appwrite");

const CONFIG = {
  APPWRITE_ENDPOINT:
    process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1",
  APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY: process.env.APPWRITE_API_KEY,
  DATABASE_ID: process.env.DATABASE_ID,
  COLLECTION_ID: process.env.COLLECTION_ID,
  BASE_URL: "https://hiredup.me",
};

// ─── Static pages ─────────────────────────────────────────────────────────────

const STATIC_PAGES = [
  { url: "",                    changeFrequency: "daily",   priority: 1.0 },
  { url: "/jobs",               changeFrequency: "hourly",  priority: 0.9 },
  { url: "/jobs/categories",    changeFrequency: "weekly",  priority: 0.85 },
  { url: "/companies",          changeFrequency: "daily",   priority: 0.8 },
  { url: "/job-seekers",        changeFrequency: "weekly",  priority: 0.8 },
  { url: "/employers",          changeFrequency: "weekly",  priority: 0.8 },
  { url: "/talent-search",      changeFrequency: "daily",   priority: 0.7 },
  { url: "/post-job",           changeFrequency: "monthly", priority: 0.7 },
  { url: "/pricing",            changeFrequency: "monthly", priority: 0.6 },
  { url: "/salary-estimator",   changeFrequency: "monthly", priority: 0.7 },
  { url: "/blog",               changeFrequency: "weekly",  priority: 0.7 },
  { url: "/resources",          changeFrequency: "weekly",  priority: 0.6 },
  { url: "/success-stories",    changeFrequency: "weekly",  priority: 0.6 },
  { url: "/contact",            changeFrequency: "monthly", priority: 0.5 },
  { url: "/privacy",            changeFrequency: "yearly",  priority: 0.3 },
  { url: "/terms",              changeFrequency: "yearly",  priority: 0.3 },
  { url: "/cookies",            changeFrequency: "yearly",  priority: 0.3 },
];

// ─── Category SEO pages ───────────────────────────────────────────────────────
// Sourced from /src/lib/job-categories.js — JOB_CATEGORIES slugs
// These are high-value evergreen pages targeting "jobs in bangladesh" type queries
// Priority 0.85 — just below the /jobs listing but above individual job posts

const CATEGORY_SLUGS = [
  "software-developer-jobs",
  "it-jobs",
  "accounting-finance-jobs",
  "marketing-jobs",
  "hr-jobs",
  "sales-jobs",
  "design-jobs",
  "customer-service-jobs",
  "engineering-jobs",
  "data-analyst-jobs",
  "remote-jobs",
  "fresher-jobs",
];

const CATEGORY_PAGES = CATEGORY_SLUGS.map((slug) => ({
  url: `/jobs/category/${slug}`,
  changeFrequency: "daily",   // jobs are added daily — re-crawl often
  priority: 0.85,
}));

// ─── Location SEO pages ───────────────────────────────────────────────────────
// Sourced from /src/lib/job-categories.js — JOB_LOCATIONS slugs
// Target "jobs in dhaka", "remote jobs bangladesh" etc.

const LOCATION_SLUGS = [
  "dhaka",
  "chittagong",
  "sylhet",
  "rajshahi",
  "remote-bangladesh",
];

const LOCATION_PAGES = LOCATION_SLUGS.map((slug) => ({
  url: `/jobs/location/${slug}`,
  changeFrequency: "daily",
  priority: 0.80,
}));

// ─── All non-job pages combined ───────────────────────────────────────────────
const ALL_STATIC_PAGES = [...STATIC_PAGES, ...CATEGORY_PAGES, ...LOCATION_PAGES];

// ─── Appwrite fetch ───────────────────────────────────────────────────────────

async function fetchAllJobs() {
  const client = new Client()
    .setEndpoint(CONFIG.APPWRITE_ENDPOINT)
    .setProject(CONFIG.APPWRITE_PROJECT_ID)
    .setKey(CONFIG.APPWRITE_API_KEY);

  const databases = new Databases(client);

  const allJobs = [];
  let lastId = null;
  const limit = 100;
  let batchCount = 0;

  console.log("Starting to fetch jobs using Appwrite SDK...");

  while (true) {
    const queries = [Query.orderDesc("$createdAt"), Query.limit(limit)];
    if (lastId) queries.push(Query.cursorAfter(lastId));

    try {
      const response = await databases.listDocuments(
        CONFIG.DATABASE_ID,
        CONFIG.COLLECTION_ID,
        queries,
      );

      const documents = response.documents;
      if (documents.length === 0) {
        console.log("No more documents.");
        break;
      }

      allJobs.push(...documents);
      batchCount++;
      console.log(
        `Batch ${batchCount}: fetched ${documents.length} jobs (total: ${allJobs.length})`,
      );

      if (documents.length < limit) {
        console.log("Reached end of collection.");
        break;
      }

      lastId = documents[documents.length - 1].$id;
    } catch (error) {
      console.error("Error fetching jobs:", error.message);
      throw error;
    }
  }

  console.log(`Finished fetching. Total jobs: ${allJobs.length}`);
  return allJobs;
}

// ─── XML generation ───────────────────────────────────────────────────────────

function escapeXML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${escapeXML(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function generateSitemapXML(jobs, staticPages) {
  const validJobs = jobs.filter((job) => job.slug);
  const now = new Date().toISOString();

  console.log(`\nURL breakdown:`);
  console.log(`  Static pages:    ${STATIC_PAGES.length}`);
  console.log(`  Category pages:  ${CATEGORY_PAGES.length}`);
  console.log(`  Location pages:  ${LOCATION_PAGES.length}`);
  console.log(`  Job pages:       ${validJobs.length}`);
  console.log(`  Total:           ${staticPages.length + validJobs.length}`);

  // Static + category + location pages
  const staticEntries = staticPages.map((page) =>
    urlEntry(
      `${CONFIG.BASE_URL}${page.url}`,
      now,
      page.changeFrequency,
      page.priority,
    ),
  );

  // Individual job pages — use actual updatedAt for accurate freshness signal
  const jobEntries = validJobs.map((job) => {
    const lastmod = job.$updatedAt || job.$createdAt || now;
    return urlEntry(
      `${CONFIG.BASE_URL}/jobs/${job.slug}`,
      lastmod,
      "daily",
      "0.8",
    );
  });

  const allUrls = [...staticEntries, ...jobEntries].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls}
</urlset>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    console.log("=== Sitemap Generation Started ===");
    console.log(`Time: ${new Date().toISOString()}`);

    const required = ["APPWRITE_PROJECT_ID", "APPWRITE_API_KEY", "DATABASE_ID", "COLLECTION_ID"];
    const missing = required.filter((key) => !CONFIG[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    const jobs = await fetchAllJobs();

    if (jobs.length === 0) {
      throw new Error("No jobs fetched from Appwrite!");
    }

    const sitemap = generateSitemapXML(jobs, ALL_STATIC_PAGES);

    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

    const sitemapPath = path.join(publicDir, "sitemap.xml");
    fs.writeFileSync(sitemapPath, sitemap, "utf8");

    const metadata = {
      generatedAt: new Date().toISOString(),
      pages: {
        static:   STATIC_PAGES.length,
        category: CATEGORY_PAGES.length,
        location: LOCATION_PAGES.length,
        jobs:     jobs.filter((j) => j.slug).length,
        total:    ALL_STATIC_PAGES.length + jobs.filter((j) => j.slug).length,
      },
      sitemapSizeKB: (sitemap.length / 1024).toFixed(2),
    };

    const metadataPath = path.join(publicDir, "sitemap-meta.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    console.log("\n=== Sitemap Generated Successfully ===");
    console.log(`Static pages:    ${metadata.pages.static}`);
    console.log(`Category pages:  ${metadata.pages.category}  ← /jobs/category/*`);
    console.log(`Location pages:  ${metadata.pages.location}  ← /jobs/location/*`);
    console.log(`Job pages:       ${metadata.pages.jobs}`);
    console.log(`Total URLs:      ${metadata.pages.total}`);
    console.log(`Sitemap size:    ${metadata.sitemapSizeKB} KB`);
    console.log(`Saved to:        ${sitemapPath}`);
    console.log("\n⚡ Next step: submit https://hiredup.me/sitemap.xml to Google Search Console");
  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
