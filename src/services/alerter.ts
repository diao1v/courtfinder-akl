import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../config";
import { cache } from "./cache";

class AlertService {
  private transporter: Transporter | null = null;
  private consecutiveFailures: number = 0;
  private lastAlertTime: Date | null = null;

  constructor() {
    if (config.alert.enabled && config.alert.smtp.host) {
      this.transporter = nodemailer.createTransport({
        host: config.alert.smtp.host,
        port: config.alert.smtp.port,
        secure: config.alert.smtp.port === 465,
        auth: {
          user: config.alert.smtp.user,
          pass: config.alert.smtp.pass,
        },
      });
    }
  }

  private isInCooldown(): boolean {
    if (!this.lastAlertTime) return false;
    const elapsed = Date.now() - this.lastAlertTime.getTime();
    return elapsed < config.alert.cooldownMinutes * 60 * 1000;
  }

  async sendAlert(subject: string, body: string): Promise<void> {
    if (!config.alert.enabled || !this.transporter) {
      console.log(`[Alert - disabled] ${subject}`);
      return;
    }

    // Skip if within cooldown period (unless recovery)
    if (this.isInCooldown() && !subject.includes("Recovered")) {
      console.log(`[Alert - cooldown] ${subject}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: config.alert.from,
        to: config.alert.to.join(", "),
        subject: `[courtfinder-akl] ${subject}`,
        text: body,
      });
      this.lastAlertTime = new Date();
      console.log(`[Alert - sent] ${subject}`);
    } catch (error) {
      console.error("[Alert - failed]", error);
    }
  }

  async onRefreshFailure(error: Error, provider?: string): Promise<void> {
    this.consecutiveFailures++;

    const subject = provider
      ? `Provider Failed: ${provider}`
      : "Refresh Failed: All Providers";

    const cacheAge = cache.getAge();
    const body = `
Refresh failure at ${new Date().toISOString()}

Provider: ${provider || "All"}
Error: ${error.message}
Consecutive failures: ${this.consecutiveFailures}

Cache status: ${cache.isStale() ? "STALE" : "OK"}
Cache age: ${cacheAge !== null ? `${cacheAge} seconds` : "N/A"}
    `.trim();

    await this.sendAlert(subject, body);
  }

  async onRecovery(): Promise<void> {
    if (this.consecutiveFailures > 0) {
      await this.sendAlert(
        "Recovered",
        `Service recovered after ${this.consecutiveFailures} consecutive failures.`
      );
      this.consecutiveFailures = 0;
    }
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}

export const alertService = new AlertService();
