/**
 * The single place that reads the environment (design §4.1, §5). Everything
 * else receives a typed config. The degradation contract:
 *  - Judge: `JUDGE_ANTHROPIC_API_KEY` → Anthropic, else `JUDGE_GEMINI_API_KEY`
 *    → Gemini, else the keyless **fake** judge.
 *  - Persistence/Storage: `SUPABASE_URL` + service-role key → Supabase, else
 *    **in-memory**.
 */
export type JudgeConfig =
  | { provider: "anthropic"; apiKey: string; model?: string }
  | { provider: "gemini"; apiKey: string; model?: string }
  | { provider: "fake" };

export type PersistenceConfig =
  | {
      kind: "supabase";
      url: string;
      serviceRoleKey: string;
      anonKey?: string;
      bucket?: string;
    }
  | { kind: "in-memory" };

export interface EnvConfig {
  judge: JudgeConfig;
  persistence: PersistenceConfig;
}

type Env = Record<string, string | undefined>;

function selectJudge(env: Env): JudgeConfig {
  if (env.JUDGE_ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: env.JUDGE_ANTHROPIC_API_KEY,
      model: env.CLAUDE_MODEL,
    };
  }
  if (env.JUDGE_GEMINI_API_KEY) {
    return {
      provider: "gemini",
      apiKey: env.JUDGE_GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    };
  }
  return { provider: "fake" };
}

function selectPersistence(env: Env): PersistenceConfig {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      kind: "supabase",
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      anonKey: env.SUPABASE_ANON_KEY,
      bucket: env.SUPABASE_STORAGE_BUCKET,
    };
  }
  return { kind: "in-memory" };
}

export function readEnv(env: Env = process.env): EnvConfig {
  return {
    judge: selectJudge(env),
    persistence: selectPersistence(env),
  };
}

/**
 * Real mode = Supabase is configured (accounts, real login). Keyless/practice
 * mode otherwise. The app/ layer reads the mode through this helper so it never
 * touches `process.env` directly (the dependency-rule guard, §4.1).
 */
export function isRealMode(env: Env = process.env): boolean {
  return selectPersistence(env).kind === "supabase";
}
