import axios from 'axios';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { mediaHostname, cdnDnsTarget } from '@/utils/cdn-settings.js';
import type { TunnelSettings } from '@/types/cloudflare-tunnel.js';
import { TunnelRecoveryRequiredError } from '@/utils/tunnel-errors.js';

const uuid = z.uuid();
const recordSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  content: z.string(),
  ttl: z.number().optional(),
  proxied: z.boolean().optional(),
  comment: z.string().nullable().optional(),
});
const ownedSchema = z.object({
  accounts: z.record(z.string(), z.object({ id: uuid })),
  routes: z.record(
    z.string(),
    z.object({
      zone: z.string(),
      hostname: z.string(),
      tunnelId: uuid,
      active: z.boolean().default(true),
      pendingTunnelId: uuid.optional(),
      recordId: z.string().optional(),
      previous: recordSchema.optional(),
    })
  ),
});
type OwnedState = z.infer<typeof ownedSchema>;

/** Non-public ownership journal. Tokens and account credentials are never persisted here. */
export class TunnelOwnershipStore {
  constructor(private readonly filename: string) {}
  read(): OwnedState {
    if (!fs.existsSync(this.filename)) {
      return { accounts: {}, routes: {} };
    }
    return ownedSchema.parse(JSON.parse(fs.readFileSync(this.filename, 'utf8')));
  }
  write(state: OwnedState): void {
    const temporary = `${this.filename}.${randomUUID()}.part`;
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    try {
      fs.writeFileSync(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, this.filename);
      fs.chmodSync(this.filename, 0o600);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
}

export interface TunnelHttp {
  request(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    data?: unknown;
    signal: AbortSignal;
  }): Promise<{ data: { success: boolean; result: unknown } }>;
}

/** REST access deliberately has no dependency on the CDN service's error logging. */
export class CloudflareTunnelApi {
  constructor(
    private readonly store: TunnelOwnershipStore,
    private readonly http: TunnelHttp = axios.create({
      baseURL: 'https://api.cloudflare.com/client/v4',
      timeout: 10_000,
      // Node's legacy startup disables global TLS validation; this client always verifies Cloudflare.
      httpsAgent: new https.Agent({ rejectUnauthorized: true }),
    }) as TunnelHttp
  ) {}

  async restoreRoutes(
    settings: TunnelSettings,
    signal: AbortSignal,
    keepHostnames: ReadonlySet<string> = new Set()
  ): Promise<void> {
    const state = this.store.read();
    const routes = Object.values(state.routes).filter(
      (route) => route.zone === settings.cloudflareZoneId && !keepHostnames.has(route.hostname)
    );
    if (routes.length === 0) {
      return;
    }
    if (!settings.cloudflareEmailAddress || !settings.cloudflareGlobalApiKey) {
      throw new Error('Missing DNS restoration credentials');
    }
    const headers = {
      'X-Auth-Email': settings.cloudflareEmailAddress,
      'X-Auth-Key': settings.cloudflareGlobalApiKey,
    };
    const request = async (method: string, url: string, data?: unknown): Promise<unknown> => {
      const response = await this.http.request({ method, url, data, headers, signal });
      if (!response.data.success) {
        throw new Error('Cloudflare DNS restoration failed');
      }
      return response.data.result;
    };
    for (const route of routes) {
      const base = `/zones/${route.zone}/dns_records`;
      const records = z
        .array(recordSchema)
        .parse(
          await request('GET', `${base}?name=${encodeURIComponent(route.hostname)}&per_page=100`)
        );
      if (!route.active && records.length !== 1) {
        continue;
      }
      if (records.length === 0 && (!route.active || route.previous === undefined)) {
        route.active = false;
        delete route.pendingTunnelId;
        this.store.write(state);
        continue;
      }
      if (records.length !== 1) {
        throw new Error('Conflicting DNS records during tunnel restoration');
      }
      // Zod produced a dense array and the count was validated above.
      const [current] = records as [z.infer<typeof recordSchema>];
      if (
        !(
          current.type === 'CNAME' &&
          (current.content === `${route.tunnelId}.cfargotunnel.com` ||
            current.content === `${route.pendingTunnelId ?? route.tunnelId}.cfargotunnel.com`)
        )
      ) {
        // A released route is no longer ours unless provider rollback restored our known alias.
        if (!route.active) {
          continue;
        }
        const mediaTarget =
          settings.storageConfig === undefined ? undefined : cdnDnsTarget(settings.storageConfig);
        if (
          mediaTarget !== undefined &&
          route.hostname ===
            `externalvideos.${settings.publicNodeAddress.trim().toLowerCase().replace(/\.$/, '')}` &&
          current.type === 'CNAME' &&
          current.content === mediaTarget
        ) {
          route.active = false;
          delete route.pendingTunnelId;
          this.store.write(state);
          continue;
        }
        const previous = route.previous;
        if (
          current.type === previous?.type &&
          current.content === previous.content &&
          current.proxied === previous.proxied
        ) {
          route.active = false;
          delete route.pendingTunnelId;
          this.store.write(state);
          continue;
        }
        throw new Error('Managed DNS record was changed externally');
      }
      if (route.previous !== undefined) {
        const { id: _id, ...body } = route.previous;
        await request('PUT', `${base}/${current.id}`, body);
      } else {
        await request('DELETE', `${base}/${current.id}`);
      }
      route.active = false;
      delete route.pendingTunnelId;
      this.store.write(state);
      // Retain the original snapshot: failed CDN clear can roll provider state back to named DNS.
    }
  }

  async provision(
    settings: TunnelSettings,
    origin: string,
    signal: AbortSignal
  ): Promise<{ token: string; publicUrl: string }> {
    const name = settings.cloudflareTunnelName?.trim();
    if (
      !settings.cloudflareEmailAddress ||
      !settings.cloudflareZoneId ||
      !settings.cloudflareGlobalApiKey ||
      !name
    ) {
      throw new Error('Missing Cloudflare Tunnel configuration');
    }
    z.string()
      .regex(/^[a-f0-9]{32}$/i)
      .parse(settings.cloudflareZoneId);
    const headers = {
      'X-Auth-Email': settings.cloudflareEmailAddress,
      'X-Auth-Key': settings.cloudflareGlobalApiKey,
    };
    const request = async (
      method: string,
      url: string,
      data?: unknown,
      requestSignal = signal
    ): Promise<unknown> => {
      const response = await this.http.request({
        method,
        url,
        data,
        headers,
        signal: requestSignal,
      });
      if (!response.data.success) {
        throw new Error('Cloudflare Tunnel REST request failed');
      }
      return response.data.result;
    };
    const zone = z
      .object({ name: z.string(), account: z.object({ id: z.string().regex(/^[a-f0-9]{32}$/i) }) })
      .parse(await request('GET', `/zones/${settings.cloudflareZoneId}`));
    const hostname = mediaHostname(settings.publicNodeAddress).slice('externalvideos.'.length);
    if (hostname !== zone.name && !hostname.endsWith('.' + zone.name)) {
      throw new Error('Node hostname is outside Cloudflare zone');
    }
    const state = this.store.read();
    const account = zone.account.id;
    const base = `/accounts/${account}/cfd_tunnel`;
    let tunnel = state.accounts[account];
    if (tunnel !== undefined) {
      try {
        const existing = z
          .object({ id: uuid, deleted_at: z.string().nullable().optional() })
          .parse(await request('GET', `${base}/${tunnel.id}`));
        if (
          existing.deleted_at !== undefined &&
          existing.deleted_at !== null &&
          existing.deleted_at !== ''
        ) {
          tunnel = undefined;
        }
      } catch (error) {
        // Only a definite deletion of our recorded UUID allows recreation. Network/auth errors do not.
        if ((error as { response?: { status?: number } }).response?.status === 404) {
          tunnel = undefined;
        } else {
          throw error;
        }
      }
    }
    if (tunnel !== undefined) {
      await request('PATCH', `${base}/${tunnel.id}`, {
        name,
      });
    } else {
      const created = z.object({ id: uuid }).parse(
        await request('POST', base, {
          name,
          config_src: 'cloudflare',
        })
      );
      tunnel = { id: created.id };
      state.accounts[account] = tunnel;
      try {
        this.store.write(state);
      } catch {
        // Creation is ours; compensate if it cannot be journaled. Never adopt/delete by name.
        try {
          await request('DELETE', `${base}/${created.id}`, undefined, AbortSignal.timeout(10_000));
        } catch {
          throw new TunnelRecoveryRequiredError('Tunnel ownership write and remote cleanup failed');
        }
        throw new Error('Could not save Cloudflare Tunnel ownership');
      }
    }
    const hostnames = [hostname];
    if (settings.storageConfig?.storageMode !== 's3provider') {
      hostnames.push(`externalvideos.${hostname}`);
    }
    await request('PUT', `${base}/${tunnel.id}/configurations`, {
      config: {
        ingress: [
          ...hostnames.map((host) => ({ hostname: host, service: origin })),
          { service: 'http_status:404' },
        ],
      },
    });
    for (const host of hostnames) {
      const key = `${settings.cloudflareZoneId}:${host}`;
      const url = `/zones/${settings.cloudflareZoneId}/dns_records`;
      const records = z
        .array(recordSchema)
        .parse(await request('GET', `${url}?name=${encodeURIComponent(host)}&per_page=100`));
      if (records.length > 1) {
        throw new Error('Conflicting DNS records for the Node hostname');
      }
      const current = records[0];
      const target = `${tunnel.id}.cfargotunnel.com`;
      let route = state.routes[key];
      if (
        route !== undefined &&
        !route.active &&
        !(
          current?.type === 'CNAME' &&
          (current.content === `${route.tunnelId}.cfargotunnel.com` ||
            current.content === `${route.pendingTunnelId ?? route.tunnelId}.cfargotunnel.com`)
        )
      ) {
        // Explicitly selecting this hostname again begins a new ownership period.
        if (current === undefined) {
          delete route.previous;
        } else {
          route.previous = current;
        }
      }
      if (route === undefined) {
        route = {
          zone: settings.cloudflareZoneId,
          hostname: host,
          tunnelId: tunnel.id,
          active: true,
          previous: current,
        };
        state.routes[key] = route;
        // Journal the prior record before touching it, including an interrupted-create intent.
        this.store.write(state);
      } else if (
        current !== undefined &&
        !(
          current.type === 'CNAME' &&
          (current.content === `${route.tunnelId}.cfargotunnel.com` ||
            current.content === `${route.pendingTunnelId ?? route.tunnelId}.cfargotunnel.com`)
        ) &&
        !(
          current.type === route.previous?.type &&
          current.name === route.previous.name &&
          current.content === route.previous.content &&
          current.proxied === route.previous.proxied
        )
      ) {
        throw new Error('Managed DNS record was changed externally');
      }
      // Persist ownership of both targets before changing a route, so a crash can be retried safely.
      route.active = true;
      route.pendingTunnelId = tunnel.id;
      this.store.write(state);
      const body = {
        type: 'CNAME',
        name: host,
        content: target,
        ttl: 1,
        proxied: true,
        comment: `MoarTube tunnel ${tunnel.id}`,
      };
      if (current?.type !== 'CNAME' || current.content !== target || current.proxied !== true) {
        const saved = recordSchema.parse(
          await request(current ? 'PUT' : 'POST', current ? `${url}/${current.id}` : url, body)
        );
        route.recordId = saved.id;
      } else {
        route.recordId = current.id;
      }
      route.tunnelId = tunnel.id;
      delete route.pendingTunnelId;
      this.store.write(state);
    }
    // Hostname/storage changes release only obsolete owned aliases in this zone.
    await this.restoreRoutes(settings, signal, new Set(hostnames));
    const token = z
      .string()
      .min(1)
      .parse(await request('GET', `${base}/${tunnel.id}/token`));
    return { token, publicUrl: `https://${hostname}` };
  }
}
