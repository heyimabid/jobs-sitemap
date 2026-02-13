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
  const seenIds = new Set(); // Track IDs to prevent duplicates
  let offset = 0;
  let consecutiveEmptyOrDuplicate = 0; // Track if we're getting duplicates
  const limit = 100; // Request 100, but Appwrite might return fewer

  console.log("Starting to fetch jobs from Appwrite...");

  while (true) {
    const url = `${CONFIG.APPWRITE_ENDPOINT}/databases/${CONFIG.DATABASE_ID}/collections/${CONFIG.COLLECTION_ID}/documents?limit=${limit}&offset=${offset}`;

    if (allJobs.length % 1000 === 0 || allJobs.length < 100) {
      console.log(`Fetching batch: offset=${offset}, limit=${limit}`);
    }

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

      // Stop if we get 0 documents
      if (!data.documents || data.documents.length === 0) {
        console.log(
          `✓ No more documents. Finished with ${allJobs.length} unique jobs`,
        );
        break;
      }

      // Check for duplicates in this batch
      let newDocsInBatch = 0;
      for (const doc of data.documents) {
        const id = doc.$id;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          allJobs.push(doc);
          newDocsInBatch++;
        }
      }

      // If we got no new documents in this batch, we're past the end
      if (newDocsInBatch === 0) {
        consecutiveEmptyOrDuplicate++;
        console.log(
          `⚠ Batch had 0 new documents (${consecutiveEmptyOrDuplicate} consecutive duplicate batches)`,
        );

        // Stop if we get 3 consecutive batches with no new documents
        if (consecutiveEmptyOrDuplicate >= 3) {
          console.log(
            `✓ Stopped at ${allJobs.length} unique jobs (no new documents in ${consecutiveEmptyOrDuplicate} batches)`,
          );
          break;
        }
      } else {
        consecutiveEmptyOrDuplicate = 0; // Reset counter
      }

      const batchSize = data.documents.length;

      // Log progress every 1000 jobs
      if (allJobs.length % 1000 === 0 || allJobs.length < 1000) {
        console.log(
          `Fetched ${allJobs.length} unique jobs so far (batch: ${batchSize}, new: ${newDocsInBatch}, API total: ${data.total || "unknown"})`,
        );
      }

      // Move offset by how many documents Appwrite returned (not how many were new)
      offset += batchSize;

      // Safety limit - adjust this if you have more than 100k jobs
      if (allJobs.length >= 100000) {
        console.warn(`⚠ Reached safety limit of 100k unique jobs.`);
        break;
      }

      // Also stop if offset gets unreasonably high (indicates we're looping)
      if (offset > 200000) {
        console.warn(
          `⚠ Offset reached ${offset}, stopping to prevent infinite loop`,
        );
        break;
      }
    } catch (error) {
      console.error(`Error fetching jobs at offset ${offset}:`, error.message);
      throw error;
    }
  }

  console.log(`Finished fetching. Total unique jobs: ${allJobs.length}`);
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
