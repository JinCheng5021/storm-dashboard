import { syncJtwcStorms, getActiveJtwcStorms } from "./src/services/jtwc.service.js";

async function run() {
  console.log("Testing sync...");
  const result = await syncJtwcStorms();
  console.log("Sync Result:", result);

  console.log("Fetching active storms...");
  const storms = await getActiveJtwcStorms();
  console.log(`Found ${storms.length} active storms.`);
  if (storms.length > 0) {
     console.log(JSON.stringify(storms[0].metadata, null, 2));
  }
}
run();
