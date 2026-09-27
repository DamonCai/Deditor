import { closeoutSheets } from './xmind-closeout';

/** Canonical native widths, separated from legacy fo:max-width compatibility. */
export function widthCloseoutSheets() {
  return [undefined, 150, 300].map(width => {
    const sheet = closeoutSheets()[4];
    sheet.id = `width-${width ?? 'auto'}`;
    sheet.title = sheet.id;
    sheet.rootTopic.title = `Canonical ${sheet.id}`;
    for (const topic of sheet.rootTopic.children!.detached!) {
      delete topic.style!.properties!['fo:max-width'];
      if (width !== undefined) topic.customWidth = width;
    }
    return sheet;
  });
}
