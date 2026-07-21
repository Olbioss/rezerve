/** Read a required environment variable, failing fast with a clear message. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name} — see .env.example`
    );
  }
  return value;
}
