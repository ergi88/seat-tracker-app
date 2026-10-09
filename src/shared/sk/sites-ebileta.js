/* ------------------------------------------------------------------
 * Site adapters: al.ebileta.al (Albania) and eu.ebileta.al (Kosovo)
 *
 * Both run the same ticketing software, so one definition serves both;
 * only the host, the name and the currency differ.
 *
 * Two page shapes matter:
 *  1) scegliSettorePub.do?idEvento=N  -> the sector list:
 *       <li class="link_settore sett_<idSett>"> <a href="scegliPostoPub.do?idSett=..&idSM=..&tipoM=.."
 *          data-content="TRIBUNA N105"><span class="dispAlta|dispInEsaurimento|dispEsaurita">
 *  2) scegliPostoPub.do?idSett=..&idSM=..&tipoM=1 -> one sector's seats, inline:
 *       var posti = [ [idSeat, isFree, x, y, fontSize, rotation, 'SECTOR Rreshti R Vendi N', 'N', idRate], ... ];
 * The public event list is listaEventiPub.do.
 *
 * Seats are ordered by x: the seat page always opens a sector laid out
 * horizontally.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  const ORIGIN = 'https://al.ebileta.al';

  /* every eBileta host: site id, name, origin, the currency its prices are in */
  const HOSTS = [
    { id: 'ebileta', label: 'eBileta', origin: ORIGIN, currency: 'ALL' },
    /* the sector list sits on the event list page itself (listaEventiPub.do) and no
     * address carries idEvento: an event is known by the idSM in its sector links */
    { id: 'ebileta-ks', label: 'eBileta Kosovo', origin: 'https://eu.ebileta.al', currency: 'EUR', byIdSM: true }
  ];
  const hostOf = hostname => HOSTS.find(h => h.origin === 'https://' + String(hostname || '').toLowerCase()) || null;
  const isEbileta = siteId => HOSTS.some(h => h.id === siteId);

  /* The address that names this page's event. With one event on sale, eBileta
   * drops the event list and puts that event's sectors straight on
   * listaEventiPub.do — an address that names no event at all. Both hosts do
   * it. The idSM of the sector links is what names the event there, so it is
   * added to the address. -> url | null */
  function eventPageUrl(host, href, sections) {
    if (!host) return null;
    if (SK.site(host.id).eventFromUrl(href)) return href;
    const idSM = idSMIn(sections);
    if (!idSM) return null;
    const u = new URL(href);
    u.hash = '';
    u.searchParams.set('idSM', idSM);
    return u.toString();
  }

  const idSMIn = sections => String(((sections || []).find(x => x && x.idSM) || {}).idSM || '');

  /* Which seating map this event's sectors were read from. eBileta gives every
   * event its own idSM even when its sectors share their ids with other events
   * in the same stadium, so this is what recognises an event on a page that
   * names none. -> "1215" | "" */
  function idSMOf(ev) {
    if (!ev) return '';
    for (const s of ev.sectors || []) if (s.meta && s.meta.idSM) return String(s.meta.idSM);
    const sm = /^sm(\d+)$/.exec(String(ev.siteId || ''));
    if (sm) return sm[1];
    return String((ev.extra && ev.extra.idSM) || '');
  }

  /* "Kosova - Republika e Irlandes - September 24, 2026, 8:45 PM - FADIL VOKRRI STADIUM"
   * -> { title: 'Kosova - Republika e Irlandes', date: 'September 24, 2026, 8:45 PM', venue: 'FADIL VOKRRI STADIUM' } */
  function splitHeading(text) {
    const parts = String(text || '').split(/\s+-\s+/).map(x => x.trim()).filter(Boolean);
    const i = parts.findIndex(x => /\b(19|20)\d\d\b/.test(x) && /\d{1,2}:\d\d|[A-Za-z]{3,}\s+\d{1,2}/.test(x));
    if (i < 1) return { title: String(text || '').trim(), date: '', venue: '' };
    return { title: parts.slice(0, i).join(' - '), date: parts[i], venue: parts.slice(i + 1).join(' - ') };
  }

  const STATUS_LABELS = {
    dispAlta: 'high',
    dispMedia: 'medium',
    dispBassa: 'low',
    dispInEsaurimento: 'low',
    dispEsaurita: 'soldout'
  };

  /* "TRIBUNA N105" -> "N105" */
  function shortCode(name) {
    return String(name || '')
      .replace(/^(TRIBUNA|TRIBUNE|TRIBUNAL|SETTORE|SECTOR|SEKTORI|CURVA|GRADINATA|PARTERRE|PLATEA)\s+/i, '')
      .trim();
  }

  function parseSections(html) {
    const sections = [];
    const liRe = /class="link_settore\s+sett_(\d+)"([\s\S]*?)<\/li>/g;
    let m;
    while ((m = liRe.exec(html)) !== null) {
      const body = m[2];
      const name = SK.util.decodeHtml((body.match(/data-content="([^"]*)"/) || [])[1] || '').trim();
      const href = ((body.match(/href="([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&');
      const cls = (body.match(/class="(disp[A-Za-z]+)/) || [])[1] || '';
      const params = new URLSearchParams(href.split('?')[1] || '');
      sections.push({
        id: m[1], name, code: shortCode(name),
        idSM: params.get('idSM') || '', tipoM: params.get('tipoM') || '1',
        status: STATUS_LABELS[cls] || (cls || 'unknown')
      });
    }
    const title = SK.util.decodeHtml(((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '')
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
    return { title, sections };
  }

  /* Descriptions look like "<SECTOR> <rowWord> <row> <seatWord> <seat>";
   * the words are localised, so work positionally first. */
  function splitDescr(descr, seat) {
    const t = descr.split(' ').filter(Boolean);
    if (t.length >= 4 && t[t.length - 1] === String(seat)) {
      return { sectionName: t.slice(0, t.length - 4).join(' '), row: t[t.length - 3] };
    }
    const kw = descr.match(/(?:Rreshti|Fila|Row|Reihe|Rang|Rang[ée]e|Rij)\s+(\S+)/i);
    if (kw) return { sectionName: descr.slice(0, kw.index).trim(), row: kw[1] };
    return { sectionName: t.slice(0, Math.max(0, t.length - 4)).join(' '), row: '?' };
  }

  /* The opened section's price block:
   *   <div class="tabprezzi"> <h2>Tribuna N105</h2> <div class="prezzi">Rates from Lekë1,045.00 to Lekë1,045.00</div>
   * -> { min, max, currency: 'ALL' }, or null when the page has none */
  function parsePrices(html, currency) {
    const re = /class="prezzi"[^>]*>([\s\S]*?)<\/div>/g;
    const parts = [];
    let m;
    while ((m = re.exec(html)) !== null) parts.push(SK.util.decodeHtml(m[1].replace(/<[^>]*>/g, ' ')));
    return parts.length && SK.profit ? SK.profit.priceRange(parts.join(' '), currency || 'ALL') : null;
  }

  /* -> { section, seats: [{ id, free, x, y, row, seat, rate }], price }; seats [] = no numbered map */
  function parseSeats(html, currency) {
    const price = parsePrices(html, currency);
    const start = html.indexOf('var posti');
    if (start === -1) return { section: '', seats: [], price };
    const tail = html.slice(start);
    const end = tail.indexOf('];');
    const body = end === -1 ? tail : tail.slice(0, end);
    const rowRe = /\[\s*(\d+)\s*,\s*(true|false)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*\]/g;

    const seats = [];
    let section = '';
    let m;
    while ((m = rowRe.exec(body)) !== null) {
      const descr = m[7].replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();
      const seat = m[8];
      const parts = splitDescr(descr, seat);
      if (!section && parts.sectionName) section = parts.sectionName;
      seats.push({ id: m[1], free: m[2] === 'true', x: parseFloat(m[3]), y: parseFloat(m[4]), row: parts.row, seat, rate: m[9] });
    }
    return { section, seats, price };
  }

  function parseEventList(html) {
    const byId = new Map();
    const clean = s => SK.util.decodeHtml(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    for (const chunk of String(html).split(/<tr class="filtroeventi/).slice(1)) {
      const row = chunk.split('</tr>')[0];
      const id = (row.match(/idEvento=(\d+)/) || [])[1];
      if (!id || byId.has(id)) continue;
      const hidden = key => clean((row.match(new RegExp(`campo_ricerca_${key}"[^>]*>([^<]*)<`)) || [])[1]);
      const cls = (row.match(/<span class="(disp[A-Za-z]+)"/) || [])[1] || '';
      byId.set(id, {
        id,
        title: hidden('titolo') || clean((row.match(/griglia titolo[\s\S]*?<span class="attivo">([\s\S]*?)<\/span>/) || [])[1]),
        date: clean((row.match(/griglia data[\s\S]*?<span class="attivo">([\s\S]*?)<\/span>/) || [])[1]) || hidden('data'),
        venue: clean((row.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1]),
        status: STATUS_LABELS[cls] || cls || 'unknown'
      });
    }
    return [...byId.values()];
  }

  function seatPageUrl(section, origin) {
    return `${origin || ORIGIN}/biglietteria/pub/buyseats/scegliPostoPub.do?idSett=${encodeURIComponent(section.id)}&idSM=${encodeURIComponent(section.idSM || '')}&tipoM=${encodeURIComponent(section.tipoM || '1')}`;
  }

  function sectorPageUrl(idEvento, origin) {
    return `${origin || ORIGIN}/biglietteria/pub/buyseats/scegliSettorePub.do?idEvento=${encodeURIComponent(idEvento)}`;
  }

  const eventListUrl = origin => `${origin || ORIGIN}/biglietteria/listaEventiPub.do`;

  /* a parsed section -> the extension's sector shape */
  function toSector(s) {
    return { id: String(s.id), code: s.code, name: s.name, meta: { idSM: s.idSM, tipoM: s.tipoM, status: s.status } };
  }

  const opts = { credentials: 'include' };   // some events need the logged-in session

  for (const host of HOSTS) SK.registerSite({
    id: host.id,
    label: host.label,
    origin: host.origin,
    priceCurrency: host.currency,
    rowOrder: 'x',
    /* hold: this site's pages can put seats in its own cart, so the popup may
     * offer Reserve on a request that belongs to one of them */
    /* sweep: worth scanning every sector now and then. eBileta holds stands
     * back and releases them near the date, and each sector is one request. */
    can: { prices: false, listEvents: true, hold: true, sweep: true },
    pages: [{ key: 'sectors', label: 'sector list page' }, { key: 'seats', label: 'seat page' }, { key: 'events', label: 'event list page' }],
    badges: 'badges on sectors and the stadium map',
    sectorMaxAgeMs: 60 * 1000,

    eventFromUrl(url) {
      const u = String(url || '');
      if (!u.toLowerCase().startsWith(host.origin + '/')) return null;
      const idSM = (/^[^#]*[?&]idSM=(\d+)/.exec(u) || [])[1];
      if (host.byIdSM) return idSM || null;
      const idEvento = (/^[^#]*[?&]idEvento=(\d+)/.exec(u) || [])[1];
      if (idEvento) return idEvento;
      /* Only the event list page: with one event on sale it shows that event's
       * sectors and names no idEvento, so the seating map has to stand in for
       * it. A seat page carries an idSM too, but it belongs to an event this
       * site already knows by number — never invent a second one from it. */
      return /\/listaEventiPub\.do/i.test(u) && idSM ? 'sm' + idSM : null;
    },

    eventUrl(ev) {
      return host.byIdSM || /^sm\d+$/.test(String(ev.siteId))
        ? eventListUrl(host.origin)
        : sectorPageUrl(ev.siteId, host.origin);
    },

    sectorUrl(ev, sector) {
      const m = sector && sector.meta;
      return m && m.idSM ? seatPageUrl({ id: sector.id, idSM: m.idSM, tipoM: m.tipoM }, host.origin) : null;
    },

    scanAllFilter(sector) { return !(sector.meta && sector.meta.status === 'soldout'); },

    sectorHint(sector) {
      const st = sector.meta && sector.meta.status;
      return st === 'soldout' ? 'sold out (site list)' : st && st !== 'unknown' ? `${st} availability` : sector.name;
    },

    /* Two page shapes, and an event can move between them while you are
     * tracking it: with several events on sale its sectors live at
     * scegliSettorePub.do?idEvento=N, and with one event left they move to the
     * event list page itself, which names no idEvento. So try the numbered
     * page, then the list page — recognising the event there by its idSM,
     * never by "it is the only one", which would happily scan the seats of
     * whichever match replaced it. */
    async loadEvent(ev, ctx) {
      const numbered = !host.byIdSM && /^\d+$/.test(String(ev.siteId));
      /* on a host that names events by idSM, the event's own id is the idSM */
      const wantSM = host.byIdSM ? String(ev.siteId) : idSMOf(ev);

      if (numbered) {
        const page = parseSections(await ctx.net.text(sectorPageUrl(ev.siteId, host.origin), opts));
        if (page.sections.length) return { title: page.title || ev.title, sectors: page.sections.map(toSector) };
      }

      const html = await ctx.net.text(eventListUrl(host.origin), opts);
      const page = parseSections(html);
      if (page.sections.length) {
        /* An event tracked by number, whose own page has stopped answering,
         * and which has never been scanned — so there is no idSM to recognise
         * it by. Taking whatever is here would scan another match's seats into
         * it, which is worse than saying so. */
        if (!wantSM) throw new Error('the event page now shows one event and names no idEvento — open that event\'s page once so its seating map is known');
        const mine = page.sections.filter(x => String(x.idSM) === wantSM);
        if (mine.length) return { title: page.title || ev.title, sectors: mine.map(toSector) };
        throw new Error('this event is no longer on the event page');
      }

      /* a list of events: ours should be on it, and its own page should work */
      const list = parseEventList(html);
      if (numbered && list.some(e => String(e.id) === String(ev.siteId))) {
        const again = parseSections(await ctx.net.text(sectorPageUrl(ev.siteId, host.origin), opts));
        if (again.sections.length) return { title: again.title || ev.title, sectors: again.sections.map(toSector) };
      }
      throw new Error(list.length
        ? 'this event is no longer on the site'
        : 'no sectors on the event page (a queue, the event closed or login needed?)');
    },

    async scan(ev, ids, ctx) {
      const byId = new Map((ev.sectors || []).map(s => [String(s.id), s]));
      const results = {};
      const errors = [];
      for (const id of ids) {
        const sector = byId.get(String(id));
        if (!sector) { errors.push(`${id}: not in the sector list`); continue; }
        try {
          const { seats, price } = parseSeats(await ctx.net.text(this.sectorUrl(ev, sector), opts), host.currency);
          results[sector.id] = seats.length
            ? { seats: seats.map(s => ({ row: s.row, label: s.seat, x: s.x, y: s.y, free: s.free, cat: s.rate, id: s.id })), price }
            : { unmapped: true, note: 'no numbered seat map for this sector' };
        } catch (e) {
          errors.push(`${sector.code}: ${e.message}`);
        }
      }
      return { results, errors };
    },

    async listEvents(ctx) {
      const html = await ctx.net.text(eventListUrl(host.origin), opts);
      const list = host.byIdSM ? [] : parseEventList(html);
      if (list.length) return list.map(e => ({ siteId: e.id, title: e.title, date: e.date, venue: e.venue, status: e.status }));
      /* no list, so the page is one event's sectors: the event is its idSM */
      const page = parseSections(html);
      const ids = [...new Set(page.sections.map(x => x.idSM).filter(Boolean))];
      if (!ids.length) throw new Error(host.byIdSM ? 'no event on the event page (a queue?)' : 'event list came back empty');
      const head = splitHeading(page.title);
      return ids.map(id => ({ siteId: host.byIdSM ? id : 'sm' + id, title: head.title, date: head.date, venue: head.venue, status: 'unknown' }));
    }
  });

  SK.ebileta = { ORIGIN, HOSTS, hostOf, isEbileta, eventPageUrl, idSMOf, idSMIn, splitHeading, STATUS_LABELS, shortCode, parseSections, parseSeats, parsePrices, parseEventList, seatPageUrl, sectorPageUrl, toSector };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);
