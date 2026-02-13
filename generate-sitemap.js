// generate-sitemap.js
// Run this script in GitHub Actions to generate sitemap

const fs = require("fs");
const path = require("path");

const CONFIG = {
  APPWRITE_ENDPOINT:
    process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1",
  APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY: process.env.APPWRITE_API_KEY,
  DATABASE_ID: process.env.DATABASE_ID,
  COLLECTION_ID: process.env.COLLECTION_ID,
  BASE_URL: "https://hiredup.me",
};

async function fetchAllJobs() {
  const allJobs = [];
  let offset = 0;
  const limit = 100; // GitHub Actions has no limit!

  console.log("Starting to fetch jobs from Appwrite...");

  while (true) {
    const url = `${CONFIG.APPWRITE_ENDPOINT}/databases/${CONFIG.DATABASE_ID}/collections/${CONFIG.COLLECTION_ID}/documents?limit=${limit}&offset=${offset}`;

    console.log(`Fetching batch: offset=${offset}, limit=${limit}`);

    try {
      const response = await fetch(url, {
        headers: {
          "X-Appwrite-Project": CONFIG.APPWRITE_PROJECT_ID,
          "X-Appwrite-Key": CONFIG.APPWRITE_API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Appwrite API error: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();

      if (!data.documents || data.documents.length === 0) {
        console.log("No more documents to fetch");
        break;
      }

      allJobs.push(...data.documents);
      console.log(
        `Fetched ${allJobs.length} jobs so far (total: ${data.total || "unknown"})`,
      );

      // Check if we got all documents
      if (data.total && allJobs.length >= data.total) {
        console.log(`Fetched all ${data.total} documents`);
        break;
      }

      // If we got fewer than requested, we're done
      if (data.documents.length < limit) {
        console.log("Received fewer documents than limit, finishing");
        break;
      }

      offset += limit;

      // Safety limit
      if (allJobs.length >= 100000) {
        console.log("Safety limit reached");
        break;
      }
    } catch (error) {
      console.error(`Error fetching jobs at offset ${offset}:`, error.message);
      throw error;
    }
  }

  console.log(`Finished fetching. Total jobs: ${allJobs.length}`);
  return allJobs;
}

function generateSitemapXML(jobs) {
  const validJobs = jobs.filter((job) => job.slug);

  console.log(`Generating sitemap for ${validJobs.length} valid jobs`);

  const jobUrls = validJobs
    .map((job) => {
      const lastmod =
        job.$updatedAt || job.$createdAt || new Date().toISOString();
      return `  <url>
    <loc>${CONFIG.BASE_URL}/jobs/${escapeXML(job.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${jobUrls}
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

    // Generate sitemap
    const sitemap = generateSitemapXML(jobs);

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
      generatedAt: new Date().toISOString(),
      totalJobs: jobs.length,
      validJobs: jobs.filter((j) => j.slug).length,
      sitemapSize: sitemap.length,
    };

    const metadataPath = path.join(publicDir, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    console.log("\n=== Sitemap Generated Successfully ===");
    console.log(`Total jobs: ${metadata.totalJobs}`);
    console.log(`Valid jobs with slug: ${metadata.validJobs}`);
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
