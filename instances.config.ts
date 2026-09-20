import { auth, sqliteDb } from "./src/lib/auth";

// Export Better Auth instances array for Better Auth Console compatibility
export default [
  {
    id: "production",
    name: "Production (Adapundi Enterprise)",
    env: "production",
    auth,
  },
];

// Cleanup handlers
export const shutdownHandlers = {
  production: () => {
    try {
      sqliteDb.close();
    } catch (err) {
      console.error("Error closing sqlite database:", err);
    }
  },
};
