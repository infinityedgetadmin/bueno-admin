/** Seeds the data folder with demo accounts and a house exchange rate. Run by `npm run dev:seeded`. */
import { storeDir } from "@/lib/store/store-path";
import { SEED_ACCOUNTS, resetStore, seedExchangeRate, seedTeam } from "@/tests/support/store";

async function main(): Promise<void> {
  await resetStore();
  await seedTeam();
  await seedExchangeRate();
  console.log(`Seeded ${storeDir()}. Open http://localhost:3000/admin and sign in as one of:`);
  for (const account of SEED_ACCOUNTS) {
    console.log(`  ${account.email}  /  ${account.password}  (${account.role})`);
  }
}

main().catch((error: unknown) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
