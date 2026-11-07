/** Public compatibility reader for icons stored in _node_settings.json. */
import { BaseService } from '@services/base.js';
import type { Logger } from '@/utils/index.js';
import { getConfig } from '@/config/index.js';

export class LinksService extends BaseService {
  constructor(logger: Logger) {
    super('LinksService', logger);
  }

  getAllLinks(): Promise<
    { link_id: number; url: string; svg_graphic: string; timestamp: number }[]
  > {
    return Promise.resolve(
      (getConfig().nodeSettings.nodeIcons ?? []).map((icon, index) => ({
        link_id: index + 1,
        url: icon.url,
        svg_graphic: icon.svgGraphic,
        timestamp: 0,
      }))
    );
  }
}
