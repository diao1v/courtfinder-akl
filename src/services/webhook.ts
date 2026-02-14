import type { Env } from "../env";
import type { SlotChange } from "./change-detector";

/**
 * Webhook target configuration
 */
interface WebhookTarget {
  name: string;
  url: string;
  secret: string;
}

/**
 * Webhook payload structure
 */
export interface WebhookPayload {
  slots: SlotChange[];
  source: string;
  timestamp: string;
}

/**
 * Get configured webhook targets from environment
 */
function getWebhookTargets(env: Env): WebhookTarget[] {
  const targets: WebhookTarget[] = [];

  // oi-my-court webhook
  if (env.WEBHOOK_URL_OIMYCOURT && env.WEBHOOK_SECRET_OIMYCOURT) {
    targets.push({
      name: "oi-my-court",
      url: env.WEBHOOK_URL_OIMYCOURT,
      secret: env.WEBHOOK_SECRET_OIMYCOURT,
    });
  }

  // is-collin-available webhook
  if (env.WEBHOOK_URL_ISCOLLIN && env.WEBHOOK_SECRET_ISCOLLIN) {
    targets.push({
      name: "is-collin-available",
      url: env.WEBHOOK_URL_ISCOLLIN,
      secret: env.WEBHOOK_SECRET_ISCOLLIN,
    });
  }

  return targets;
}

/**
 * Send webhook to a single target
 */
async function sendWebhook(
  target: WebhookTarget,
  payload: WebhookPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": target.secret,
        "X-Webhook-Source": "courtfinder-akl",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[Webhook] Failed to send to ${target.name}: ${response.status} - ${errorText}`);
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    console.log(`[Webhook] Successfully sent to ${target.name}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Webhook] Error sending to ${target.name}:`, message);
    return { success: false, error: message };
  }
}

/**
 * Notify all configured webhook targets about slot changes
 *
 * @param env - Environment bindings
 * @param changes - Array of slots that became available
 */
export async function notifySlotChanges(
  env: Env,
  changes: SlotChange[]
): Promise<void> {
  if (changes.length === 0) {
    return;
  }

  const targets = getWebhookTargets(env);

  if (targets.length === 0) {
    console.log("[Webhook] No webhook targets configured, skipping notification");
    return;
  }

  const payload: WebhookPayload = {
    slots: changes,
    source: "courtfinder-akl",
    timestamp: new Date().toISOString(),
  };

  console.log(`[Webhook] Sending ${changes.length} slot changes to ${targets.length} targets`);

  // Send to all targets in parallel
  const results = await Promise.allSettled(
    targets.map((target) => sendWebhook(target, payload))
  );

  // Log results
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[Webhook] Target ${targets[index].name} failed:`, result.reason);
    }
  });
}
