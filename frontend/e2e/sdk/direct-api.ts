/**
 * DirectAPISDK - Native fetch() implementation
 *
 * This SDK uses native fetch() to call the API endpoints directly.
 * Useful for testing API behavior without browser context.
 */

import { SudokuSDK } from './base';
import type { SDKResponse, SDKOptions } from './types';

export class DirectAPISDK extends SudokuSDK {
  constructor(options: SDKOptions = {}) {
    super(options);
  }

  protected async get<T>(path: string): Promise<SDKResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeout),
      });

      return this.parseResponse<T>(response);
    } catch (error) {
      return this.handleError<T>(error);
    }
  }

  protected async post<T>(path: string, body: unknown): Promise<SDKResponse<T>> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
      });

      return this.parseResponse<T>(response);
    } catch (error) {
      return this.handleError<T>(error);
    }
  }

  private async parseResponse<T>(response: Response): Promise<SDKResponse<T>> {
    const status = response.status;

    if (!response.ok) {
      let error = `HTTP ${status}`;
      try {
        const errorBody = await response.json();
        if (errorBody.error) {
          error = errorBody.error;
        } else if (errorBody.message) {
          error = errorBody.message;
        } else if (typeof errorBody === 'string') {
          error = errorBody;
        }
      } catch {
        // Response body is not JSON, try text
        try {
          const textBody = await response.text();
          if (textBody) {
            error = textBody;
          }
        } catch {
          // Ignore text parsing errors
        }
      }

      return {
        ok: false,
        status,
        error,
      };
    }

    try {
      const data = await response.json() as T;
      return {
        ok: true,
        status,
        data,
      };
    } catch {
      return {
        ok: false,
        status,
        error: 'Failed to parse JSON response',
      };
    }
  }

  private handleError<T>(error: unknown): SDKResponse<T> {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return {
          ok: false,
          status: 0,
          error: `Request timeout after ${this.timeout}ms`,
        };
      }

      return {
        ok: false,
        status: 0,
        error: error.message,
      };
    }

    return {
      ok: false,
      status: 0,
      error: 'Unknown error occurred',
    };
  }
}

export default DirectAPISDK;
