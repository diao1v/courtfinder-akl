import { createMimeMessage } from "mimetext";
import type { Env } from "../env";
import { getEnvNumber } from "../env";
import * as kvCache from "./kv-cache";

// KV key for alert state
const ALERT_STATE_KEY = "alert_state";

interface AlertState {
  consecutiveFailures: number;
  lastAlertTime: string | null; // ISO 8601
}

/**
 * Get alert state from KV
 */
async function getAlertState(kv: KVNamespace): Promise<AlertState> {
  const state = await kv.get<AlertState>(ALERT_STATE_KEY, "json");
  return state ?? { consecutiveFailures: 0, lastAlertTime: null };
}

/**
 * Set alert state in KV
 */
async function setAlertState(kv: KVNamespace, state: AlertState): Promise<void> {
  await kv.put(ALERT_STATE_KEY, JSON.stringify(state));
}

/**
 * Check if alert is in cooldown period
 */
function isInCooldown(state: AlertState, cooldownMinutes: number): boolean {
  if (!state.lastAlertTime) return false;
  const elapsed = Date.now() - new Date(state.lastAlertTime).getTime();
  return elapsed < cooldownMinutes * 60 * 1000;
}

/**
 * Send an alert email using Cloudflare Email Routing
 */
async function sendAlert(
  env: Env,
  subject: string,
  body: string
): Promise<void> {
  const state = await getAlertState(env.CACHE);
  const cooldownMinutes = getEnvNumber(env, "ALERT_COOLDOWN_MINUTES", 30);

  // Skip if within cooldown period (unless recovery)
  if (isInCooldown(state, cooldownMinutes) && !subject.includes("Recovered")) {
    console.log(`[Alert - cooldown] ${subject}`);
    return;
  }

  // Check if EMAIL binding is available
  if (!env.EMAIL) {
    console.log(`[Alert - no email binding] ${subject}`);
    console.log(`Body: ${body}`);
    return;
  }

  const fromAddress = env.ALERT_FROM || "alerts@courtfinder.app";
  const toAddress = env.ALERT_TO;

  if (!toAddress) {
    console.log(`[Alert - no recipient configured] ${subject}`);
    return;
  }

  try {
    const msg = createMimeMessage();
    msg.setSender({ addr: fromAddress, name: "CourtFinder Alerts" });
    msg.setRecipient(toAddress);
    msg.setSubject(`[courtfinder-akl] ${subject}`);
    msg.addMessage({ contentType: "text/plain", data: body });

    // Create EmailMessage using the global constructor provided by Workers runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const EmailMessageClass = (globalThis as any).EmailMessage;
    if (!EmailMessageClass) {
      console.log("[Alert - EmailMessage not available in runtime]");
      return;
    }

    const message = new EmailMessageClass(fromAddress, toAddress, msg.asRaw());
    await env.EMAIL.send(message);

    // Update last alert time
    await setAlertState(env.CACHE, {
      ...state,
      lastAlertTime: new Date().toISOString(),
    });

    console.log(`[Alert - sent] ${subject}`);
  } catch (error) {
    console.error("[Alert - failed]", error);
  }
}

/**
 * Handle refresh failure - increment failure count and send alert
 */
export async function onRefreshFailure(
  env: Env,
  error: Error,
  provider?: string
): Promise<void> {
  const state = await getAlertState(env.CACHE);
  const newState: AlertState = {
    ...state,
    consecutiveFailures: state.consecutiveFailures + 1,
  };
  await setAlertState(env.CACHE, newState);

  const subject = provider
    ? `Provider Failed: ${provider}`
    : "Refresh Failed: All Providers";

  const cacheAge = await kvCache.getCacheAge(env.CACHE);
  const isStale = await kvCache.isStale(env.CACHE, env);

  const body = `
Refresh failure at ${new Date().toISOString()}

Provider: ${provider || "All"}
Error: ${error.message}
Consecutive failures: ${newState.consecutiveFailures}

Cache status: ${isStale ? "STALE" : "OK"}
Cache age: ${cacheAge !== null ? `${cacheAge} seconds` : "N/A"}
  `.trim();

  await sendAlert(env, subject, body);
}

/**
 * Handle recovery - send recovery alert if there were failures
 */
export async function onRecovery(env: Env): Promise<void> {
  const state = await getAlertState(env.CACHE);

  if (state.consecutiveFailures > 0) {
    await sendAlert(
      env,
      "Recovered",
      `Service recovered after ${state.consecutiveFailures} consecutive failures.`
    );

    // Reset failure count
    await setAlertState(env.CACHE, {
      ...state,
      consecutiveFailures: 0,
    });
  }
}

/**
 * Get current consecutive failure count
 */
export async function getFailureCount(kv: KVNamespace): Promise<number> {
  const state = await getAlertState(kv);
  return state.consecutiveFailures;
}
