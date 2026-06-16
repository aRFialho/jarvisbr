import "dotenv/config";

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    "DATABASE_URL",
    process.env.NODE_ENV === "production" ? undefined : "postgresql://postgres:postgres@localhost:5432/jarvis"
  ),
  jwtSecret: required("JWT_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-jwt-secret-change-me"),
  deviceTokenSecret: required(
    "DEVICE_TOKEN_SECRET",
    process.env.NODE_ENV === "production" ? undefined : "dev-device-secret-change-me"
  ),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  executionTokenTtlMinutes: Number(process.env.EXECUTION_TOKEN_TTL_MINUTES ?? 5),
  confirmationTtlMinutes: Number(process.env.CONFIRMATION_TTL_MINUTES ?? 5)
};

export function pgSslConfig() {
  return env.databaseUrl.includes("sslmode=require") || env.databaseUrl.includes("neon.tech")
    ? { rejectUnauthorized: false }
    : undefined;
}
