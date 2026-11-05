import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

it.each(['https://example.test', 'https://temporary.trycloudflare.com', 'http://localhost:3000', 'http://[::1]:3000'])(
  'uses the browser origin %s for every watch-page share output', (origin) => {
    const template = readFileSync('public/views/watch.ejs', 'utf8');
    const start = template.indexOf('shareVideo() {');
    const end = template.indexOf('showSettings()', start);
    const values = new Map<string, string>();
    const copied: string[] = [];
    let modal: { html: string; footer?: string } | undefined;
    const $ = Object.assign((selector: string) => selector.startsWith('<div>') ? selector : {
      val(value?: string) {
        if (value === undefined) return values.get(selector);
        values.set(selector, value);
      },
      click(handler: () => void) { handler(); },
    }, {
      ajax: () => ({ done(handler: (data: object) => void) {
        handler({ isError: false });
        return { fail() {} };
      } }),
    });
    const instance = vm.runInNewContext('({' + template.slice(start, end) + '})', {
      window: { location: { origin } },
      $, encodeURIComponent,
      Swal: {
        fire(options: { html: string; didOpen: () => void }) { modal = options; options.didOpen(); },
        showLoading() {}, hideLoading() {},
      },
    }) as { shareVideo(): void };
    Object.assign(instance, {
      VIDEO_ID: 'video123', NODE_BASE_URL: 'https://different-canonical.test',
      INCOMING_PARAMETERS: { canonicalOrigin: 'https://different-canonical.test', canonicalIsLocal: true },
      refreshClickTooltips() {}, setClipboard(value: string) { copied.push(value); },
    });
    instance.shareVideo();
    expect(values.get('#node-video-url-input')).toBe(origin + '/watch?v=video123');
    expect(values.get('#video-embed-url-input')).toBe(origin + '/watch/embed/video/video123?autostart=0');
    expect(values.get('#video-embed-code-input')).toContain('src="' + origin + '/watch/embed/video/');
    expect(modal?.html).toContain('src="' + origin + '/watch/embed/video/');
    expect(modal?.footer).toBeUndefined();
    expect(copied).toHaveLength(3);
    expect(copied.every((value) => value.includes(origin))).toBe(true);
    expect(copied.join('')).not.toContain('different-canonical');
  }
);
