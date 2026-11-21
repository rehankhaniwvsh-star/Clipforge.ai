/**
 * Tracks temporary Blob URLs by logical key and guarantees revocation when
 * replaced, removed, or cleared so browser memory does not leak.
 */
class ObjectUrlManager {
  private registry = new Map<string, string>();

  create(key: string, blob: Blob): string {
    this.revoke(key);
    const url = URL.createObjectURL(blob);
    this.registry.set(key, url);
    return url;
  }

  get(key: string): string | undefined {
    return this.registry.get(key);
  }

  revoke(key: string): void {
    const existing = this.registry.get(key);
    if (existing) {
      try {
        URL.revokeObjectURL(existing);
      } catch {
        // Ignore already-revoked URLs
      }
      this.registry.delete(key);
    }
  }

  revokeUrl(url?: string): void {
    if (!url || !url.startsWith('blob:')) return;
    for (const [k, v] of this.registry.entries()) {
      if (v === url) {
        this.registry.delete(k);
        break;
      }
    }
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  revokeAll(): void {
    for (const url of this.registry.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    this.registry.clear();
  }
}

export const objectUrlManager = new ObjectUrlManager();
