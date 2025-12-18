/**
 * Sudoku API SDK - Playwright API Request Implementation
 *
 * Uses Playwright's APIRequestContext for making HTTP requests.
 * Useful for API tests within Playwright test files.
 */

import type { APIRequestContext } from '@playwright/test';
import { SudokuSDK } from './base';
import type { SDKOptions, SDKResponse } from './types';

export interface PlaywrightAPISDKOptions extends SDKOptions {
  request: APIRequestContext;
}

export class PlaywrightAPISDK extends SudokuSDK {
  private request: APIRequestContext;

  constructor(options: PlaywrightAPISDKOptions) {
    super(options);
    this.request = options.request;
  }

  protected async get<T>(path: string): Promise<SDKResponse<T>> {
    try {
      const response = await this.request.get(`${this.baseUrl}${path}`, {
        timeout: this.timeout,
      });

      const status = response.status();
      const ok = response.ok();

      if (!ok) {
        let error: string;
        try {
          const body = await response.json();
          error = body.error || body.message || `HTTP ${status}`;
        } catch {
          error = `HTTP ${status}`;
        }
        return { ok: false, status, error };
      }

      const data = await response.json();
      return { ok: true, status, data };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, status: 0, error };
    }
  }

  protected async post<T>(path: string, body: unknown): Promise<SDKResponse<T>> {
    try {
      const response = await this.request.post(`${this.baseUrl}${path}`, {
        data: body,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: this.timeout,
      });

      const status = response.status();
      const ok = response.ok();

      if (!ok) {
        let error: string;
        try {
          const responseBody = await response.json();
          error = responseBody.error || responseBody.message || `HTTP ${status}`;
        } catch {
          error = `HTTP ${status}`;
        }
        return { ok: false, status, error };
      }

      const data = await response.json();
      return { ok: true, status, data };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, status: 0, error };
    }
  }
}

export default PlaywrightAPISDK;
