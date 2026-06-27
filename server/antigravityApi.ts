/**
 * TASK 1 — antigravityApi.ts
 * Uses real ANTIGRAVITY_API_URL from env. Falls back gracefully if not set.
 */

import axios from 'axios';

const BASE_URL = process.env.ANTIGRAVITY_API_URL ?? '';

export interface AntigravityAccountData {
  email: string;
  planType: string;
  creditBalance: number;
  creditLimit: number;
  projectCount: number;
}

/**
 * Fetch account data from the real Antigravity API.
 * If BASE_URL is not configured, returns local dev fallback data — no crash.
 */
export async function fetchAntigravityAccountData(
  credential: string
): Promise<AntigravityAccountData> {
  if (!BASE_URL) {
    console.warn('[antigravityApi] ANTIGRAVITY_API_URL not set — using local fallback data');
    return {
      email: 'local@dev',
      planType: 'free',
      creditBalance: 30,
      creditLimit: 30,
      projectCount: 0,
    };
  }

  try {
    const response = await axios.get<AntigravityAccountData>(
      `${BASE_URL}/account`,
      {
        headers: { Authorization: `Bearer ${credential}` },
        timeout: 8000,
      }
    );
    return response.data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach Antigravity API — check your credential. Detail: ${msg}`);
  }
}

/**
 * Validate a single credential against the Antigravity API.
 * Returns true if valid, false if invalid (4xx), throws on network error.
 */
export async function validateAntigravityCredential(
  credential: string
): Promise<boolean> {
  if (!BASE_URL) {
    console.warn('[antigravityApi] ANTIGRAVITY_API_URL not set — skipping validation, returning true');
    return true;
  }

  try {
    await axios.get(`${BASE_URL}/validate`, {
      headers: { Authorization: `Bearer ${credential}` },
      timeout: 8000,
    });
    return true;
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response && err.response.status < 500) {
      return false;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach Antigravity API — check your credential. Detail: ${msg}`);
  }
}
