import axios from "axios";
import readline from "node:readline";
import { loadSecrets, saveSecrets } from "./secrets";

/**
 * Service to send out-of-band notifications via ntfy.kuyacarlo.dev
 */
export class NotificationService {
  private baseURL: string;
  private auth: string | null;

  constructor(config?: { baseURL?: string; user?: string; pass?: string }) {
    this.baseURL = config?.baseURL || process.env.BANTAY_NTFY_URL || "https://ntfy.sh";

    const user = config?.user || process.env.BANTAY_NTFY_USERNAME;
    const pass = config?.pass || process.env.BANTAY_NTFY_PASSWORD;

    if (user && pass) {
      this.auth = Buffer.from(`${user}:${pass}`).toString("base64");
    } else {
      this.auth = null;
    }
  }

  /**
   * Sends an alert to the specified topic
   * @param topic ntfy topic name
   * @param message Alert message body
   * @param actions Optional action buttons (approve/deny)
   */
  async sendAlert(topic: string, message: string, actions?: any[]) {
    const url = `${this.baseURL}/${topic}`;

    const headers: Record<string, string> = {
      Title: "Bantay Security Alert",
      Tags: "warning,shield,rotating_light",
      Priority: "4", // High
    };

    if (actions && actions.length > 0) {
      // ntfy Action buttons format: "view, label, url; view, label, url"
      const ntfyActions = actions
        .map((a) => `${a.type || "view"}, ${a.label}, ${a.url}`)
        .join("; ");
      headers["Actions"] = ntfyActions;
    }

    const executePost = async () => {
      const currentHeaders = { ...headers };
      if (this.auth) {
        currentHeaders["Authorization"] = `Basic ${this.auth}`;
      }
      return axios.post(url, message, { headers: currentHeaders });
    };

    try {
      await executePost();
      console.log(`[ntfy] Alert sent to topic: ${topic}`);
    } catch (error: any) {
      if (error.response?.status === 401) {
        try {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

          const username = await ask("ntfy requires auth. Enter username: ");
          const password = await ask("Enter password: ");
          rl.close();

          if (username && password) {
            this.auth = Buffer.from(`${username}:${password}`).toString("base64");

            // Retry with auth
            await executePost();
            console.log(`[ntfy] Alert sent to topic: ${topic} (authenticated)`);

            // Save for future use
            const currentSecrets = await loadSecrets();
            await saveSecrets({
              ...currentSecrets,
              BANTAY_NTFY_USERNAME: username,
              BANTAY_NTFY_PASSWORD: password,
            });
          }
        } catch (retryError: any) {
          console.warn(
            `[ntfy] Failed to send alert after auth attempt: ${
              retryError.response?.data || retryError.message
            }`
          );
        }
      } else {
        console.warn(`[ntfy] Failed to send alert: ${error.response?.data || error.message}`);
      }
    }
  }

  /**
   * Verifies connectivity to the ntfy server
   * @param topic Optional topic to verify access to
   */
  // async checkConnection(topic?: string) {
  //   const url = topic ? `${this.baseURL}/${topic}` : this.baseURL;
  //   const headers: Record<string, string> = {};
  //   if (this.auth) {
  //     headers["Authorization"] = `Basic ${this.auth}`;
  //   }

  //   try {
  //     // Use a short timeout for the connectivity check
  //     await axios.get(url, { headers, timeout: 5000, validateStatus: (status) => status < 400 });
  //     console.log(`[ntfy] Connection verified: ${url}`);
  //   } catch (error) {
  //     console.error(`[ntfy] Connection check failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
  //     throw new Error(`ntfy server unreachable or authentication failed at ${url}`);
  //   }
  // }
}
