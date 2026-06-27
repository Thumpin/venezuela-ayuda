import { searchCheckins, searchHospitalRegistry } from "../src/lib/data.ts";
import { mergePeople } from "../src/lib/people.ts";

// Mock global or environment if needed
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:5432";
process.env.SUPABASE_SECRET_KEY = "mock";

async function run() {
  const checkins = await searchCheckins({ status: "LOOKING_FOR_SOMEONE", limit: 150 });
  const registry = await searchHospitalRegistry({ limit: 150, allowEmpty: true });

  console.log(`Found ${checkins.length} checkins.`);
  console.log(`Found ${registry.length} hospital records.`);

  const mendozaCheckin = checkins.find(c => c.name.includes("Mendoza"));
  const mendozaRegistry = registry.find(r => r.name.includes("Mendoza"));

  console.log("Mendoza Checkin in DB:", mendozaCheckin);
  console.log("Mendoza Registry in DB:", mendozaRegistry);

  const merged = mergePeople(checkins, registry, []);
  const mendozaMerged = merged.find(p => p.name.includes("Mendoza"));

  console.log("Mendoza Merged:", mendozaMerged);
}

run().catch(console.error);
