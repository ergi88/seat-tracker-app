/* ------------------------------------------------------------------
 * Stadium drawings, one per venue, in their own coordinates.
 *
 * Air Albania Stadium is drawn after viagogo's map of it. Its section names
 * are eBileta's sector codes exactly (E106, N205, V101...), so a section is
 * its sector by code. The stadium is symmetric about the halfway line, so
 * the east corners are the west ones mirrored.
 *
 * A venue: { id, name, sites, viewBox: [x, y, w, h], outline,
 *            pitch: { x, y, w, h } | stage: { x, y, w, h, label } | stage: { points, label, lx, ly },
 *            sections: [{ code, shape: 'rect', x, y, w, h } |
 *                       { code, shape: 'poly', points: [[x, y]...] } |
 *                       { code, shape: 'grid', x, y, w, h, cols, rows, table(row, col) },
 *                       + label: { x, y, size, rotate }],
 *            covered: /re/  sectors the drawing shows inside another one (not listed under the map) }
 * ------------------------------------------------------------------ */
import { SK } from './sk.js';

const W = 1352;                                   // the halfway line is at W / 2
const flipX = x => W - x;

function rect(code, x, y, w, h, label) {
  return { code, shape: 'rect', x, y, w, h, label: Object.assign({ x: x + w / 2, y: y + h / 2, size: 22, rotate: 0 }, label) };
}
function poly(code, points, label) {
  const cx = points.reduce((a, p) => a + p[0], 0) / points.length;
  const cy = points.reduce((a, p) => a + p[1], 0) / points.length;
  return { code, shape: 'poly', points, label: Object.assign({ x: cx, y: cy, size: 13, rotate: 0 }, label) };
}
/* the same section on the other side of the halfway line */
function mirror(s, code) {
  if (s.shape === 'rect') return rect(code, W - s.x - s.w, s.y, s.w, s.h, { size: s.label.size, rotate: s.label.rotate });
  return poly(code, s.points.map(([x, y]) => [flipX(x), y]).reverse(),
    { x: flipX(s.label.x), y: s.label.y, size: s.label.size, rotate: -s.label.rotate });
}

/* ---------------- Air Albania Stadium, Tirana ----------------------- */

const west = {
  /* upper tier, north-west corner, outside in */
  E202: poly('E202', [[108, 205], [178, 176], [205, 268], [172, 288]], { x: 160, y: 236, size: 18, rotate: -20 }),
  E201: poly('E201', [[92, 224], [108, 205], [172, 288], [162, 298]], { x: 132, y: 256, size: 11, rotate: 50 }),
  N207: poly('N207', [[62, 258], [92, 224], [162, 298], [152, 310]], { x: 110, y: 276, size: 11, rotate: 38 }),
  N206: poly('N206', [[24, 288], [60, 258], [150, 312], [132, 335], [24, 335]], { x: 78, y: 314, size: 18 }),
  /* lower tier corner */
  E101: poly('E101', [[168, 304], [208, 290], [212, 343], [195, 355]], { x: 197, y: 324, size: 11 }),
  N106: poly('N106', [[145, 330], [166, 306], [194, 352], [205, 360], [140, 360]], { x: 168, y: 345, size: 11 }),
  /* upper east stand, west half */
  E203: rect('E203', 183, 163, 147, 107),
  E204: rect('E204', 340, 163, 134, 107),
  E205: rect('E205', 484, 163, 132, 107),
  /* lower east stand, west half */
  E102: rect('E102', 216, 281, 99, 62, { size: 20 }),
  E103: rect('E103', 325, 281, 133, 62, { size: 20 }),
  E104: rect('E104', 467, 281, 136, 62, { size: 20 }),
  /* north stand */
  N205: rect('N205', 22, 343, 105, 97), N204: rect('N204', 22, 452, 105, 130), N203: rect('N203', 22, 592, 105, 133),
  N202: rect('N202', 22, 735, 105, 133), N201: rect('N201', 22, 878, 105, 104),
  N105: rect('N105', 136, 368, 69, 90, { size: 18 }), N104: rect('N104', 136, 468, 69, 132, { size: 18 }),
  N103: rect('N103', 136, 610, 69, 132, { size: 18 }), N102: rect('N102', 136, 752, 69, 130, { size: 18 }),
  N101: rect('N101', 136, 892, 69, 90, { size: 18 }),
  /* west stand, west half */
  W101: rect('W101', 272, 1008, 46, 70, { size: 16, rotate: -90 }),
  W102: rect('W102', 327, 1008, 133, 58, { size: 20 }),
  W103: rect('W103', 468, 1008, 133, 58, { size: 20 })
};

const AIR_ALBANIA_SECTIONS = [
  ...Object.values(west),
  /* the middle of each long stand */
  rect('E206', 626, 163, 100, 107), rect('E105', 612, 281, 128, 62, { size: 20 }), rect('W104', 610, 1006, 132, 46, { size: 20 }),
  /* east corners: the west ones mirrored */
  mirror(west.E202, 'E210'), mirror(west.E201, 'E211'), mirror(west.N207, 'S201'), mirror(west.N206, 'S202'),
  mirror(west.E101, 'E109'), mirror(west.N106, 'S101'),
  mirror(west.E203, 'E209'), mirror(west.E204, 'E208'), mirror(west.E205, 'E207'),
  mirror(west.E102, 'E108'), mirror(west.E103, 'E107'), mirror(west.E104, 'E106'),
  mirror(west.W101, 'W107'), mirror(west.W102, 'W106'), mirror(west.W103, 'W105'),
  /* south stand: shaped like the north one, split differently (V is the visitors' end) */
  mirror(west.N205, 'S203'), mirror(west.N204, 'S204'),
  rect('S205', 1225, 595, 105, 108), rect('V201', 1225, 713, 105, 152), rect('V202', 1225, 876, 105, 106),
  rect('S102', 1147, 368, 69, 90, { size: 18 }), rect('S103', 1147, 468, 69, 132, { size: 18 }),
  rect('S104', 1147, 610, 69, 93, { size: 18 }), rect('V101', 1147, 713, 69, 42, { size: 16 }),
  rect('V102', 1147, 764, 69, 118, { size: 18 }), rect('V103', 1147, 892, 69, 90, { size: 18 })
];

/* ---------------- Pallati i Kongreseve, Tirana ---------------------- */

/* Posttick's seating chart for the hall (Max Amini), drawn after viagogo's
 * map of it. Posttick names its sectors "Block A1"; the sector code is the
 * short name, A1, which is what the drawing uses. One block holds seats at
 * several prices, so the map can be read per price (see StadiumMap). */
const KONGRESEVE_SECTIONS = [
  poly('D1', [[355, 228], [473, 203], [510, 425], [410, 442], [300, 475], [225, 515], [200, 462], [196, 420], [215, 355]], { x: 350, y: 348, size: 26 }),
  poly('D2', [[515, 218], [685, 210], [852, 218], [818, 422], [690, 413], [550, 422]], { x: 682, y: 305, size: 26 }),
  poly('D3', [[895, 208], [1015, 237], [1155, 375], [1170, 410], [1168, 462], [1140, 525], [1040, 488], [940, 455], [857, 433]], { x: 1012, y: 356, size: 26 }),
  poly('A5', [[551, 490], [813, 490], [770, 670], [690, 666], [594, 670]], { x: 681, y: 560, size: 24 }),
  poly('A4', [[380, 600], [463, 573], [478, 693], [380, 728], [295, 763], [318, 695], [345, 640]], { x: 390, y: 655, size: 24 }),
  poly('A6', [[892, 573], [975, 600], [1010, 640], [1038, 695], [1060, 763], [972, 728], [878, 693]], { x: 965, y: 655, size: 24 }),
  poly('A2', [[535, 708], [680, 695], [825, 708], [779, 865], [680, 856], [580, 865]], { x: 679, y: 768, size: 24 }),
  poly('A1', [[267, 800], [380, 750], [488, 716], [548, 888], [450, 920], [370, 960], [297, 1018], [270, 980], [262, 880]], { x: 400, y: 850, size: 24 }),
  poly('A3', [[862, 722], [985, 760], [1090, 805], [1095, 880], [1090, 960], [1060, 1022], [970, 958], [880, 915], [810, 893]], { x: 955, y: 855, size: 24 }),
  poly('B', [[35, 765], [110, 700], [200, 645], [318, 587], [322, 605], [270, 670], [240, 750], [222, 860], [222, 950], [235, 1012], [192, 1055], [140, 1000], [95, 930], [60, 850]], { x: 150, y: 820, size: 26 }),
  poly('C', [[1040, 598], [1110, 625], [1200, 680], [1325, 775], [1300, 860], [1260, 950], [1210, 1020], [1168, 1065], [1125, 1018], [1135, 940], [1135, 850], [1110, 760], [1080, 680], [1040, 610]], { x: 1215, y: 830, size: 26 })
];

/* ---------------- Štark Arena hall plan (Senidah, eFinity) ------------
 * Drawn after viagogo's map of Senidah's concert. eFinity names the stands
 * "A TRIBINE"... and sells PARTER and the two fan pits as standing areas
 * (no seat data). Its 125 bar tables (BARSKI STO 1..125) are one section
 * here, "Bar Table", as the extension already treats them: one row per
 * table, free only when all six seats are. The grid is laid out as on
 * viagogo: 1..25 along the stage, 101..125 at the back. */
const SENIDAH_SECTIONS = [
  poly('E TRIBINE', [[648, 140], [868, 48], [897, 140], [880, 155], [735, 205], [682, 213]], { x: 772, y: 140, size: 24 }),
  poly('F TRIBINE', [[893, 118], [1136, 118], [1133, 142], [897, 142]], { x: 1014, y: 130, size: 15 }),   // too narrow for a count: the sheet has it
  poly('F DOLE', [[755, 212], [880, 155], [1135, 155], [1265, 215], [1190, 210], [1110, 184], [905, 184], [790, 210]], { x: 1009, y: 169, size: 20 }),
  poly('G TRIBINE', [[1155, 48], [1365, 135], [1325, 205], [1300, 207], [1135, 142]], { x: 1250, y: 135, size: 24 }),
  poly('H TRIBINE', [[1365, 135], [1387, 140], [1567, 318], [1440, 388], [1415, 355], [1437, 318], [1325, 205]], { x: 1445, y: 262, size: 24, rotate: 45 }),
  poly('I TRIBINE', [[1567, 318], [1585, 325], [1665, 530], [1535, 566], [1465, 392], [1440, 388]], { x: 1560, y: 445, size: 24, rotate: 67 }),
  poly('J TRIBINE', [[1525, 580], [1665, 530], [1665, 798], [1525, 800]], { x: 1595, y: 670, size: 24 }),
  poly('K TRIBINE', [[1525, 808], [1665, 798], [1550, 1065], [1440, 995]], { x: 1550, y: 930, size: 24, rotate: -67 }),
  poly('L TRIBINE', [[1440, 995], [1550, 1065], [1355, 1265], [1315, 1180], [1420, 1075], [1395, 1035]], { x: 1432, y: 1128, size: 24, rotate: -45 }),
  poly('M TRIBINE', [[1315, 1180], [1355, 1265], [1110, 1360], [1095, 1268], [1215, 1230]], { x: 1222, y: 1272, size: 24 }),
  poly('N TRIBINE', [[875, 1268], [1095, 1268], [1110, 1362], [865, 1362]], { x: 988, y: 1316, size: 24 }),
  poly('N DOLE', [[740, 1195], [865, 1250], [1120, 1250], [1250, 1190], [1235, 1185], [1140, 1215], [860, 1220], [760, 1190]], { x: 995, y: 1233, size: 20 }),
  poly('O TRIBINE', [[668, 1183], [875, 1268], [865, 1362], [632, 1268]], { x: 757, y: 1275, size: 24 }),
  poly('P TRIBINE', [[448, 1068], [555, 993], [588, 1030], [555, 1063], [668, 1183], [632, 1268]], { x: 557, y: 1128, size: 24, rotate: 45 }),
  poly('A TRIBINE', [[348, 835], [485, 805], [555, 993], [448, 1068]], { x: 452, y: 935, size: 24, rotate: 67 }),
  poly('B TRIBINE', [[348, 570], [485, 582], [485, 805], [348, 835]], { x: 416, y: 700, size: 24 }),
  poly('C TRIBINE', [[460, 325], [568, 393], [485, 580], [350, 570]], { x: 460, y: 455, size: 24, rotate: -67 }),
  poly('D TRIBINE', [[460, 325], [645, 142], [682, 213], [580, 315], [608, 365], [568, 393]], { x: 570, y: 268, size: 24, rotate: -45 }),
  rect('PARTER', 618, 287, 785, 338, { size: 28 }),
  poly('FAN PIT DESNO', [[596, 840], [933, 840], [933, 1022], [747, 1022], [747, 1182], [596, 1083]], { x: 765, y: 935, size: 24 }),
  poly('FAN PIT LEVO', [[1040, 840], [1387, 840], [1387, 1053], [1235, 1182], [1235, 1022], [1040, 1022]], { x: 1212, y: 935, size: 24 }),
  { code: 'Bar Table', shape: 'grid', x: 619, y: 677, w: 794, h: 161, cols: 25, rows: 5,
    table: (row, col) => (4 - row) * 25 + col + 1, label: { x: 1016, y: 655, size: 22, rotate: 0 } }
];

export const VENUES = [{
  id: 'air-albania',
  name: 'Air Albania Stadium',
  sites: ['ebileta'],
  viewBox: [-10, 140, W + 20, 990],
  outline: `M 0 1015 L 0 330 C 0 205 110 150 290 150 L ${W - 290} 150 C ${W - 110} 150 ${W} 205 ${W} 330 L ${W} 1015 L ${W - 255} 1110 L 255 1110 Z`,
  pitch: { x: 251, y: 394, w: 850, h: 562 },
  sections: AIR_ALBANIA_SECTIONS,
  /* sectors eBileta sells here that the drawing has no place for */
  offMap: ['V VIP', 'SKYBOX', 'MEDIA', 'TETRAPLEGJIK N', 'TETRAPLEGJIK S', 'TETRAPLEGJIK V']
}, {
  id: 'kongreseve',
  name: 'Pallati i Kongreseve',
  sites: ['posttick'],
  viewBox: [-10, 150, 1390, 1035],
  outline: 'M 465 168 L 905 173 L 1032 207 L 1190 365 C 1270 540 1330 680 1358 775 C 1320 900 1260 1010 1195 1085 L 845 1168 L 510 1168 L 165 1075 C 90 990 30 880 5 765 C 60 610 120 470 180 340 L 335 198 Z',
  stage: { x: 522, y: 977, w: 309, h: 160, label: 'SKENA' },
  sections: KONGRESEVE_SECTIONS,
  offMap: []
}, {
  id: 'senidah-arena',
  name: 'Senidah arena',
  sites: ['efinity'],
  viewBox: [280, -10, 1460, 1400],
  outline: 'M 850 0 L 1170 0 L 1415 100 L 1630 305 L 1717 515 L 1717 800 L 1605 1085 L 1380 1310 L 1110 1382 L 865 1382 L 605 1310 L 407 1110 L 297 855 L 297 568 L 405 305 L 610 100 Z',
  stage: { points: [[933, 840], [1040, 840], [1040, 1022], [1235, 1022], [1235, 1182], [747, 1182], [747, 1022], [933, 1022]], label: 'STAGE', lx: 990, ly: 1100 },
  sections: SENIDAH_SECTIONS,
  covered: /^BARSKI\s+STO\b/i,                       // every table is a cell of the Bar Table grid
  offMap: []
}];

/* The venue an event is played in, known from its sectors: when most of a
 * drawing's section codes are among the event's sector codes, it is that
 * stadium. Works for any eBileta event at Air Albania, whatever its title. */
export function venueFor(event) {
  if (!event || !event.sectors || !event.sectors.length) return null;
  const codes = new Set(event.sectors.map(s => SK.util.normKey(s.code)));
  for (const v of VENUES) {
    if (v.sites && event.site && !v.sites.includes(event.site)) continue;   // an "A1" on another site is another hall
    const hit = v.sections.filter(s => codes.has(SK.util.normKey(s.code))).length;
    if (hit >= v.sections.length * 0.6) return v;
  }
  return null;
}
