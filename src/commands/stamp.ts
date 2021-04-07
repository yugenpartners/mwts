import * as fs from 'fs';
import * as libxmljs from 'libxmljs';
import * as xml2js from 'xml2js';
import { cli } from 'cli-ux';
import { Command, flags } from '@oclif/command';

const xmlnsPrefix: string = 'mw';

async function Revision(el: libxmljs.Element) {
  const revision = await xml2js.parseStringPromise(el.toString());
  const page = await xml2js.parseStringPromise(el.parent().toString());

  return {
    page: {
      title: page.page.title[0],
      id: page.page.id[0],
    },
    id: revision.revision.id[0],
    timestamp: revision.revision.timestamp[0],
    sha1: revision.revision.sha1[0],
    buffer: el.toString(),
  };
}

export default class Stamp extends Command {
  static description = 'timestamp a MediaWiki export';
  static args = [
    { name: 'export', description: 'MediaWiki ".xml" export', required: true },
  ];

  async run() {
    const { args, flags } = this.parse(Stamp);

    // Load and parse the ".xml" export.
    const buf = await fs.readFileSync(args.export);
    const doc = <libxmljs.Document>libxmljs.parseXml(buf.toString());
    this.debug(`xmlns=${this.ns(doc)[xmlnsPrefix]}`);

    // Parse the SITEINFO element for metadata about the export.
    const elSiteInfo = <any>(
      await this.parseElement(doc, `${xmlnsPrefix}:siteinfo`)
    );
    this.log(
      `Loaded ${buf.length} bytes exported from ${elSiteInfo.siteinfo.sitename} running ${elSiteInfo.siteinfo.generator}`
    );

    // Find all REVISION elements.
    const elRevisions = this.findElements(doc, '//mw:revision');
    const revisions = await Promise.all(
      elRevisions.map(async (el) => Revision(el))
    );
    const pages = new Set(revisions.map((revision) => revision.page.title));

    this.log(`Replayed ${revisions.length} revisions of ${pages.size} pages:`);
    this.printRevisionLog(revisions);
  }

  findElements(doc: libxmljs.Document, xpath: string): Array<libxmljs.Element> {
    return doc.find(xpath, this.ns(doc));
  }

  getElement(doc: libxmljs.Document, xpath: string): libxmljs.Element {
    return <libxmljs.Element>doc.get(xpath, this.ns(doc));
  }

  ns(doc: libxmljs.Document): libxmljs.StringMap {
    return { [xmlnsPrefix]: <string>doc.root()?.namespace()?.href() };
  }

  async parseElement(doc: libxmljs.Document, xpath: string): Promise<object> {
    return await xml2js.parseStringPromise(
      this.getElement(doc, xpath).toString()
    );
  }

  printRevisionLog(revisions: Array<any>) {
    cli.table(
      revisions,
      {
        page: { get: (row: any) => row.page.title },
        id: { header: 'ID' },
        timestamp: {},
        sha1: { header: 'SHA1' },
        sha256: { header: 'SHA256' },
        size: {},
      },
      { sort: 'id' }
    );
  }
}
