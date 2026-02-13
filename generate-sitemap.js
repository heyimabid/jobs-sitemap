// generate-sitemap.js
// Run this script in GitHub Actions to generate sitemap
// Uses Appwrite SDK for reliable cursor pagination
// Includes both static pages and dynamic job URLs

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

// Static pages from your sitemap.js (copied and adapted)
const STATIC_PAGES = [
  { url: "", changeFrequency: "daily", priority: 1.0 },
  { url: "/jobs", changeFrequency: "hourly", priority: 0.9 },
  { url: "/companies", changeFrequency: "daily", priority: 0.8 },
  { url: "/job-seekers", changeFrequency: "weekly", priority: 0.8 },
  { url: "/employers", changeFrequency: "weekly", priority: 0.8 },
  { url: "/talent-search", changeFrequency: "daily", priority: 0.7 },
  { url: "/post-job", changeFrequency: "monthly", priority: 0.7 },
  { url: "/pricing", changeFrequency: "monthly", priority: 0.6 },
  { url: "/salary-estimator", changeFrequency: "monthly", priority: 0.7 },
  { url: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { url: "/resources", changeFrequency: "weekly", priority: 0.6 },
  { url: "/success-stories", changeFrequency: "weekly", priority: 0.6 },
  { url: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { url: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { url: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { url: "/cookies", changeFrequency: "yearly", priority: 0.3 },
];

async function fetchAllJobs() {
  // Initialize Appwrite SDK
  const client = new Client()
    .setEndpoint(CONFIG.APPWRITE_ENDPOINT)
    .setProject(CONFIG.APPWRITE_PROJECT_ID)
    .setKey(CONFIG.APPWRITE_API_KEY);

  const databases = new Databases(client);

  const allJobs = [];
  let lastId = null;
  const limit = 100; // Appwrite max per request
  let batchCount = 0;

  console.log("Starting to fetch jobs using Appwrite SDK...");

  while (true) {
    const queries = [Query.orderDesc("$createdAt"), Query.limit(limit)];
    if (lastId) {
      queries.push(Query.cursorAfter(lastId));
    }

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

function generateSitemapXML(jobs, staticPages) {
  const validJobs = jobs.filter((job) => job.slug);
  const now = new Date().toISOString();

  console.log(
    `Generating sitemap for ${validJobs.length} job URLs and ${staticPages.length} static pages`,
  );

  // Generate static page URLs
  const staticUrlEntries = staticPages.map((page) => {
    const fullUrl = `${CONFIG.BASE_URL}${page.url}`;
    return `  <url>
    <loc>${escapeXML(fullUrl)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changeFrequency}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  });

  // Generate job URLs
  const jobUrlEntries = validJobs.map((job) => {
    const lastmod = job.$updatedAt || job.$createdAt || now;
    return `  <url>
    <loc>${CONFIG.BASE_URL}/jobs/${escapeXML(job.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
  });

  const allUrls = [...staticUrlEntries, ...jobUrlEntries].join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls}
</urlset>`;
}

function escapeXML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function main() {
  try {
    console.log("=== Sitemap Generation Started ===");
    console.log(`Time: ${new Date().toISOString()}`);

    // Validate environment variables
    const required = [
      "APPWRITE_PROJECT_ID",
      "APPWRITE_API_KEY",
      "DATABASE_ID",
      "COLLECTION_ID",
    ];
    const missing = required.filter((key) => !CONFIG[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`,
      );
    }

    // Fetch all jobs
    const jobs = await fetchAllJobs();

    if (jobs.length === 0) {
      throw new Error("No jobs fetched from Appwrite!");
    }

    // Generate sitemap (including static pages)
    const sitemap = generateSitemapXML(jobs, STATIC_PAGES);

    // Create public directory
    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Write sitemap
    const sitemapPath = path.join(publicDir, "sitemap.xml");
    fs.writeFileSync(sitemapPath, sitemap, "utf8");

    // Write metadata
    const metadata = {
      generatedAt: now,
      totalJobs: jobs.length,
      validJobs: jobs.filter((j) => j.slug).length,
      staticPages: STATIC_PAGES.length,
      totalUrls: jobs.filter((j) => j.slug).length + STATIC_PAGES.length,
      sitemapSize: sitemap.length,
    };

    const metadataPath = path.join(publicDir, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    console.log("\n=== Sitemap Generated Successfully ===");
    console.log(`Total jobs: ${metadata.totalJobs}`);
    console.log(`Valid jobs with slug: ${metadata.validJobs}`);
    console.log(`Static pages: ${metadata.staticPages}`);
    console.log(`Total URLs: ${metadata.totalUrls}`);
    console.log(`Sitemap size: ${(metadata.sitemapSize / 1024).toFixed(2)} KB`);
    console.log(`Saved to: ${sitemapPath}`);
  } catch (error) {
    console.error("\n=== ERROR ===");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
