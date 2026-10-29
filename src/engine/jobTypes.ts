import type { Answers, CustomJobType, FinishLevel, JobCategory, JobType, JobTypeId, PriceUnit, Question, ScopeItem } from './types';

export const num = (a: Answers, k: string): number => {
  const v = a[k];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : v ? 1 : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const yes = (a: Answers, k: string): boolean => a[k] === true || a[k] === 'yes';
export const str = (a: Answers, k: string): string => (a[k] == null ? '' : String(a[k]));

/** Tile on a wood subfloor (crawlspace or upper floor) needs an uncoupling membrane. */
const woodSubfloor = (a: Answers) => !['slab', 'basement'].includes(str(a, 'foundation'));

const add = (items: ScopeItem[], assemblyId: string, qty: number) => {
  if (qty > 0) items.push({ assemblyId, qty });
};

// ---- Shared questions ----
const yearBuilt: Question = {
  id: 'yearBuilt', label: 'Year the home was built', kind: 'number', default: 1990, group: 'Property',
  help: 'Homes built before 1978 need lead-safe work practices.',
};
const foundation: Question = {
  id: 'foundation', label: "What's under the floor?", kind: 'choice', default: 'crawl', group: 'Property',
  options: [{ value: 'slab', label: 'Slab' }, { value: 'crawl', label: 'Crawlspace' }, { value: 'basement', label: 'Basement slab' }],
};
const suppliedBy = (id: string, label: string): Question => ({
  id, label, kind: 'choice', default: 'contractor', group: 'Materials',
  options: [{ value: 'contractor', label: 'I supply' }, { value: 'owner', label: 'Owner supplies' }],
});
const size = (def: number, label = 'Project size'): Question => ({
  id: 'sizeSf', label, kind: 'number', unit: 'SF', default: def, group: 'Size',
});

const COMMON_EXCLUSIONS = [
  'Permit fees and plan review (billed at cost if we pull the permit)',
  'Repair of hidden damage found after walls or floors are opened (rot, mold, code deficiencies)',
  'Hazardous material testing or removal',
];
const COMMON_EXCLUSIONS_VI = [
  'Phí giấy phép và thẩm định (tính theo chi phí thực nếu chúng tôi xin giấy phép)',
  'Sửa chữa hư hỏng ẩn phát hiện khi mở tường hoặc sàn (mục, nấm mốc, lỗi theo quy chuẩn)',
  'Kiểm tra hoặc xử lý vật liệu nguy hại',
];

// ---- Bathroom remodel ----
const bathroom: JobType = {
  id: 'bathroom', name: 'Bathroom remodel', vi: 'Sửa phòng tắm', detailed: true, unit: 'SF', category: 'Remodel',
  defaultPreset: { basic: 280, mid: 300, high: 380 },
  questions: [
    size(45, 'Bathroom floor area'),
    { id: 'showerType', label: 'Shower / tub', kind: 'choice', default: 'tile', group: 'Scope',
      options: [{ value: 'tile', label: 'Tiled shower' }, { value: 'stall', label: 'Shower stall' }, { value: 'tub', label: 'Tub + tile' }, { value: 'none', label: 'None' }] },
    { id: 'showerWallSf', label: 'Shower wall tile area', kind: 'number', unit: 'SF', default: 90, group: 'Scope' },
    { id: 'floorTileSf', label: 'Floor tile area', kind: 'number', unit: 'SF', default: 45, group: 'Scope' },
    { id: 'toilets', label: 'Toilets', kind: 'number', default: 1, group: 'Scope' },
    { id: 'vanities', label: 'Vanities', kind: 'number', default: 1, group: 'Scope' },
    { id: 'relocate', label: 'Moving any drains or fixtures?', kind: 'yesno', default: false, group: 'Plumbing',
      help: 'Moving drains adds rough plumbing, and on a slab, saw-cutting and trenching.' },
    foundation,
    { id: 'bathFan', label: 'New exhaust fan vented outside?', kind: 'yesno', default: true, group: 'Electrical',
      help: 'Required for bathrooms with a shower or tub.' },
    { id: 'lights', label: 'New lights', kind: 'number', default: 2, group: 'Electrical' },
    { id: 'gfci', label: 'GFCI outlets', kind: 'number', default: 1, group: 'Electrical' },
    { id: 'door', label: 'Replace door', kind: 'yesno', default: false, group: 'Finish' },
    suppliedBy('fixturesBy', 'Fixtures (toilet, vanity, shower)'),
    yearBuilt,
  ],
  scope: (a) => {
    const s: ScopeItem[] = [];
    const contractor = str(a, 'fixturesBy') !== 'owner';
    const relocate = yes(a, 'relocate');
    const shower = str(a, 'showerType');
    add(s, 'site_protection', 1);
    add(s, 'demo_bath', 1);
    add(s, 'drywall_wet_room', 1);
    if (shower === 'tile') {
      add(s, 'plumb_shower', 1);
      add(s, 'shower_pan', 1);
      add(s, 'tile_shower_wall', num(a, 'showerWallSf'));
      if (contractor) add(s, 'supply_shower_trim', 1);
    } else if (shower === 'stall') {
      add(s, 'plumb_shower', 1);
      add(s, 'install_shower_stall', 1);
      if (contractor) add(s, 'supply_shower_stall', 1);
    } else if (shower === 'tub') {
      add(s, 'plumb_tub', 1);
      add(s, 'tile_shower_wall', num(a, 'showerWallSf'));
      if (contractor) add(s, 'supply_tub', 1);
    }
    add(s, 'tile_floor', num(a, 'floorTileSf'));
    if (woodSubfloor(a)) add(s, 'tile_underlayment', num(a, 'floorTileSf'));
    const toilets = num(a, 'toilets');
    const vanities = num(a, 'vanities');
    if (relocate) {
      add(s, 'plumb_toilet', toilets);
      add(s, 'plumb_vanity', vanities);
      const f = str(a, 'foundation');
      if (f === 'slab' || f === 'basement') add(s, 'slab_trench', 10);
    }
    add(s, 'install_toilet', toilets);
    add(s, 'install_vanity', vanities);
    if (contractor) {
      add(s, 'supply_toilet', toilets);
      add(s, 'supply_vanity', vanities);
    }
    if (yes(a, 'bathFan')) add(s, 'vent_bath_fan', 1);
    add(s, 'elec_light', num(a, 'lights'));
    add(s, 'elec_gfci', num(a, 'gfci'));
    add(s, 'elec_20a_circuit', num(a, 'gfci') > 0 ? 1 : 0);
    add(s, 'elec_switch', num(a, 'lights') > 0 ? 1 : 0);
    add(s, 'paint_room', num(a, 'sizeSf'));
    if (yes(a, 'door')) add(s, 'door_interior', 1);
    add(s, 'cleanup_final', 1);
    return s;
  },
  exclusions: [...COMMON_EXCLUSIONS, 'Mirrors, accessories and glass shower doors unless listed'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Gương, phụ kiện và cửa kính phòng tắm trừ khi có ghi'],
};

// ---- Kitchen remodel ----
const kitchen: JobType = {
  id: 'kitchen', name: 'Kitchen remodel', vi: 'Sửa bếp', detailed: true, unit: 'SF', category: 'Remodel',
  defaultPreset: { basic: 175, mid: 200, high: 310 },
  questions: [
    size(150, 'Kitchen floor area'),
    { id: 'cabinetLf', label: 'Cabinet run (upper + lower)', kind: 'number', unit: 'LF', default: 24, group: 'Scope' },
    suppliedBy('cabinetsBy', 'Cabinets'),
    { id: 'countertopSf', label: 'Countertop area', kind: 'number', unit: 'SF', default: 45, group: 'Scope' },
    { id: 'backsplashSf', label: 'Backsplash tile area', kind: 'number', unit: 'SF', default: 30, group: 'Scope' },
    { id: 'floorType', label: 'New flooring', kind: 'choice', default: 'lvp', group: 'Scope',
      options: [{ value: 'tile', label: 'Tile' }, { value: 'lvp', label: 'LVP' }, { value: 'none', label: 'Keep existing' }] },
    foundation,
    { id: 'dishwasher', label: 'Dishwasher', kind: 'yesno', default: true, group: 'Plumbing' },
    { id: 'iceMaker', label: 'Ice maker line', kind: 'yesno', default: true, group: 'Plumbing' },
    { id: 'range', label: 'Range', kind: 'choice', default: 'electric', group: 'Electrical',
      options: [{ value: 'electric', label: 'Electric (new 50A)' }, { value: 'existing', label: 'Existing hookup' }, { value: 'gas', label: 'Gas (by others)' }] },
    { id: 'panelDistanceFt', label: 'Panel to range', kind: 'number', unit: 'ft', default: 40, group: 'Electrical' },
    { id: 'rangeVent', label: 'Range hood vented outside', kind: 'yesno', default: true, group: 'Electrical' },
    { id: 'lights', label: 'New lights', kind: 'number', default: 6, group: 'Electrical' },
    { id: 'gfci', label: 'Counter GFCI outlets', kind: 'number', default: 5, group: 'Electrical' },
    suppliedBy('fixturesBy', 'Sink and faucet'),
    yearBuilt,
  ],
  scope: (a) => {
    const s: ScopeItem[] = [];
    add(s, 'site_protection', 1);
    add(s, 'demo_kitchen', 1);
    const lf = num(a, 'cabinetLf');
    add(s, 'cabinet_install', lf);
    if (str(a, 'cabinetsBy') !== 'owner') add(s, 'cabinet_supply', lf);
    add(s, 'countertop', num(a, 'countertopSf'));
    add(s, 'tile_backsplash', num(a, 'backsplashSf'));
    const floor = str(a, 'floorType');
    if (floor === 'tile') {
      add(s, 'tile_floor', num(a, 'sizeSf'));
      if (woodSubfloor(a)) add(s, 'tile_underlayment', num(a, 'sizeSf'));
    }
    if (floor === 'lvp') add(s, 'lvp_floor', num(a, 'sizeSf'));
    if (floor !== 'none') add(s, 'floor_transition', 2);
    add(s, 'plumb_kitchen_sink', 1);
    add(s, 'install_sink', 1);
    if (str(a, 'fixturesBy') !== 'owner') add(s, 'supply_kitchen_sink', 1);
    if (yes(a, 'dishwasher')) add(s, 'plumb_dishwasher', 1);
    if (yes(a, 'iceMaker')) add(s, 'plumb_icemaker', 1);
    if (str(a, 'range') === 'electric') {
      add(s, 'elec_range_50a', 1);
      add(s, 'elec_run_63', num(a, 'panelDistanceFt'));
    }
    if (yes(a, 'rangeVent')) add(s, 'vent_range_hood', 1);
    add(s, 'elec_light', num(a, 'lights'));
    add(s, 'elec_gfci', num(a, 'gfci'));
    // Two 20A small-appliance circuits, plus a dedicated dishwasher circuit.
    add(s, 'elec_20a_circuit', 2 + (yes(a, 'dishwasher') ? 1 : 0));
    add(s, 'elec_switch', 2);
    add(s, 'drywall_patch', 2);
    add(s, 'paint_room', num(a, 'sizeSf'));
    add(s, 'cleanup_final', 1);
    return s;
  },
  exclusions: [...COMMON_EXCLUSIONS, 'Appliances (owner-supplied; we install hookups listed)', 'Gas line work'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Thiết bị gia dụng (chủ nhà cung cấp; chúng tôi đấu nối như đã liệt kê)', 'Đường ống gas'],
};

// ---- Basement / ADU conversion ----
const basement: JobType = {
  id: 'basement', name: 'Basement / ADU conversion', vi: 'Cải tạo tầng hầm / ADU', detailed: true, unit: 'SF', category: 'Remodel',
  defaultPreset: { basic: 78, mid: 85, high: 105 },
  questions: [
    size(600, 'Area being converted'),
    { id: 'newWallLf', label: 'New wall length', kind: 'number', unit: 'LF', default: 45, group: 'Walls' },
    { id: 'demoWallLf', label: 'Walls to remove', kind: 'number', unit: 'LF', default: 10, group: 'Walls' },
    { id: 'perimeterWallLf', label: 'Unfinished exterior walls to finish', kind: 'number', unit: 'LF', default: 0, group: 'Walls',
      help: 'Concrete or bare walls that need framing, insulation and drywall. 0 if already finished.' },
    { id: 'doors', label: 'New doors (30")', kind: 'number', default: 5, group: 'Walls' },
    { id: 'bifolds', label: 'Bifold doors', kind: 'number', default: 1, group: 'Walls' },
    { id: 'bedrooms', label: 'Bedrooms when done', kind: 'number', default: 4, group: 'Rooms' },
    { id: 'newBedrooms', label: 'New bedrooms being created', kind: 'number', default: 1, group: 'Rooms' },
    { id: 'egress', label: 'Do all bedrooms have an egress window?', kind: 'choice', default: 'unsure', group: 'Rooms',
      help: 'Every basement bedroom needs an emergency escape opening.',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }] },
    foundation,
    { id: 'showers', label: 'New showers', kind: 'number', default: 2, group: 'Plumbing' },
    { id: 'toilets', label: 'New toilets', kind: 'number', default: 1, group: 'Plumbing' },
    { id: 'vanities', label: 'New vanities', kind: 'number', default: 1, group: 'Plumbing' },
    { id: 'kitchenSink', label: 'Kitchen sink', kind: 'yesno', default: true, group: 'Plumbing' },
    { id: 'washer', label: 'Washer hookup', kind: 'yesno', default: true, group: 'Plumbing' },
    { id: 'iceMaker', label: 'Ice maker line', kind: 'yesno', default: true, group: 'Plumbing' },
    { id: 'drainDistanceFt', label: 'Distance to main drain', kind: 'number', unit: 'ft', default: 15, group: 'Plumbing' },
    { id: 'range50a', label: 'New 50A range circuit', kind: 'yesno', default: true, group: 'Electrical' },
    { id: 'dryer30a', label: 'New 30A dryer circuit', kind: 'yesno', default: true, group: 'Electrical' },
    { id: 'panelDistanceFt', label: 'Panel to range / dryer', kind: 'number', unit: 'ft', default: 75, group: 'Electrical' },
    { id: 'lights', label: 'New lights', kind: 'number', default: 20, group: 'Electrical' },
    { id: 'switches', label: 'New or moved switches', kind: 'number', default: 5, group: 'Electrical' },
    { id: 'outlets', label: 'New outlets', kind: 'number', default: 10, group: 'Electrical' },
    { id: 'rangeVent', label: 'Range hood vented outside', kind: 'yesno', default: true, group: 'Electrical' },
    { id: 'tileSf', label: 'Tile floor (kitchen + baths)', kind: 'number', unit: 'SF', default: 100, group: 'Finishes' },
    { id: 'lvpSf', label: 'LVP floor (other rooms)', kind: 'number', unit: 'SF', default: 0, group: 'Finishes' },
    { id: 'countertopSf', label: 'Kitchen countertop', kind: 'number', unit: 'SF', default: 20, group: 'Finishes' },
    { id: 'cabinetLf', label: 'Kitchen cabinets to install', kind: 'number', unit: 'LF', default: 12, group: 'Finishes' },
    suppliedBy('cabinetsBy', 'Cabinets'),
    suppliedBy('fixturesBy', 'Showers, toilet, vanity'),
    yearBuilt,
  ],
  scope: (a) => {
    const s: ScopeItem[] = [];
    const wall = num(a, 'newWallLf');
    const showers = num(a, 'showers');
    const toilets = num(a, 'toilets');
    const vanities = num(a, 'vanities');
    const contractor = str(a, 'fixturesBy') !== 'owner';
    add(s, 'site_protection', 1);
    add(s, 'demo_wall', num(a, 'demoWallLf'));
    add(s, 'finish_exterior_wall', num(a, 'perimeterWallLf'));
    add(s, 'frame_wall', wall);
    add(s, 'frame_opening', num(a, 'doors') + num(a, 'bifolds'));
    add(s, 'drywall_hang', wall);
    add(s, 'drywall_finish', wall);
    add(s, 'drywall_patch', num(a, 'demoWallLf') > 0 ? 2 : 0);
    add(s, 'paint_new_wall', wall);
    // Plumbing
    add(s, 'plumb_shower', showers);
    add(s, 'install_shower_stall', showers);
    add(s, 'plumb_toilet', toilets);
    add(s, 'install_toilet', toilets);
    add(s, 'plumb_vanity', vanities);
    add(s, 'install_vanity', vanities);
    if (contractor) {
      add(s, 'supply_shower_stall', showers);
      add(s, 'supply_toilet', toilets);
      add(s, 'supply_vanity', vanities);
    }
    if (yes(a, 'kitchenSink')) {
      add(s, 'plumb_kitchen_sink', 1);
      add(s, 'install_sink', 1);
      if (contractor) add(s, 'supply_kitchen_sink', 1);
      add(s, 'countertop', num(a, 'countertopSf'));
      add(s, 'elec_20a_circuit', 2); // kitchen small-appliance circuits
    }
    if (yes(a, 'washer')) add(s, 'plumb_washer', 1);
    if (yes(a, 'iceMaker')) add(s, 'plumb_icemaker', 1);
    const drain = num(a, 'drainDistanceFt');
    const f = str(a, 'foundation');
    const wetFixtures = showers + toilets + vanities + (yes(a, 'kitchenSink') ? 1 : 0) + (yes(a, 'washer') ? 1 : 0);
    if (wetFixtures > 0) {
      add(s, 'plumb_supply_run', drain);
      if (f === 'slab' || f === 'basement') add(s, 'slab_trench', drain);
    }
    // Electrical
    const run = num(a, 'panelDistanceFt');
    if (yes(a, 'range50a')) { add(s, 'elec_range_50a', 1); add(s, 'elec_run_63', run); }
    if (yes(a, 'dryer30a')) { add(s, 'elec_dryer_30a', 1); add(s, 'elec_run_103', run); add(s, 'vent_dryer', 1); }
    add(s, 'elec_light', num(a, 'lights'));
    add(s, 'elec_switch', num(a, 'switches'));
    add(s, 'elec_outlet', num(a, 'outlets'));
    add(s, 'elec_bedroom_circuit', num(a, 'newBedrooms'));
    add(s, 'elec_smoke', num(a, 'bedrooms') > 0 ? num(a, 'bedrooms') + 1 : 0);
    add(s, 'elec_misc', 1);
    // Ventilation: one fan per bathroom with a shower
    add(s, 'vent_bath_fan', showers);
    if (yes(a, 'rangeVent')) add(s, 'vent_range_hood', 1);
    // Finishes
    add(s, 'tile_floor', num(a, 'tileSf'));
    add(s, 'lvp_floor', num(a, 'lvpSf'));
    const cab = num(a, 'cabinetLf');
    add(s, 'cabinet_install', cab);
    if (str(a, 'cabinetsBy') !== 'owner') add(s, 'cabinet_supply', cab);
    add(s, 'door_interior', num(a, 'doors'));
    add(s, 'door_bifold', num(a, 'bifolds'));
    add(s, 'baseboard', Math.round(wall * 2.2));
    add(s, 'cleanup_final', 1);
    return s;
  },
  exclusions: [...COMMON_EXCLUSIONS, 'Finishing existing exterior walls, ceilings and insulation unless listed', 'Egress window cut-in unless listed', 'Electrical panel or service upgrade', 'Sewage ejector pump if drains cannot flow by gravity', 'Appliances'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Hoàn thiện tường ngoài, trần và cách nhiệt hiện có trừ khi có ghi', 'Cắt lắp cửa sổ thoát hiểm trừ khi có ghi', 'Nâng cấp tủ điện hoặc nguồn điện', 'Bơm nước thải nếu không thoát tự chảy được', 'Thiết bị gia dụng'],
};

// ---- Flooring ----
const flooring: JobType = {
  id: 'flooring', name: 'Flooring', vi: 'Lát sàn', detailed: true, unit: 'SF', category: 'Remodel',
  defaultPreset: { basic: 15, mid: 16, high: 23 },
  questions: [
    size(500, 'Floor area'),
    { id: 'floorType', label: 'New flooring', kind: 'choice', default: 'lvp', group: 'Scope',
      options: [{ value: 'lvp', label: 'LVP' }, { value: 'tile', label: 'Tile' }] },
    { id: 'removeExisting', label: 'Remove existing flooring', kind: 'yesno', default: true, group: 'Scope' },
    foundation,
    { id: 'baseboardLf', label: 'New baseboard', kind: 'number', unit: 'LF', default: 150, group: 'Scope' },
    { id: 'transitions', label: 'Transition strips', kind: 'number', default: 3, group: 'Scope' },
    yearBuilt,
  ],
  scope: (a) => {
    const s: ScopeItem[] = [];
    const sf = num(a, 'sizeSf');
    add(s, 'site_protection', 1);
    if (yes(a, 'removeExisting')) add(s, 'demo_floor', sf);
    const isTile = str(a, 'floorType') === 'tile';
    add(s, isTile ? 'tile_floor' : 'lvp_floor', sf);
    if (isTile && woodSubfloor(a)) add(s, 'tile_underlayment', sf);
    add(s, 'floor_transition', num(a, 'transitions'));
    add(s, 'baseboard', num(a, 'baseboardLf'));
    add(s, 'cleanup_final', 1);
    return s;
  },
  exclusions: [...COMMON_EXCLUSIONS, 'Subfloor repair or replacement', 'Moving furniture and appliances'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Sửa hoặc thay sàn nền', 'Di chuyển đồ đạc và thiết bị'],
};

// ---- Interior painting ----
const painting: JobType = {
  id: 'painting', name: 'Interior painting', vi: 'Sơn nội thất', detailed: true, unit: 'SF', category: 'Remodel',
  defaultPreset: { basic: 6.5, mid: 7.25, high: 10 },
  questions: [
    size(1200, 'Floor area to paint'),
    { id: 'ceilings', label: 'Paint ceilings too', kind: 'yesno', default: true, group: 'Scope' },
    { id: 'patches', label: 'Drywall repairs', kind: 'number', default: 3, group: 'Scope' },
    yearBuilt,
  ],
  scope: (a) => {
    const s: ScopeItem[] = [];
    const sf = num(a, 'sizeSf');
    add(s, 'site_protection', 1);
    add(s, 'drywall_patch', num(a, 'patches'));
    add(s, 'paint_room', sf);
    if (yes(a, 'ceilings')) add(s, 'paint_ceiling', sf);
    add(s, 'cleanup_final', 1);
    return s;
  },
  exclusions: [...COMMON_EXCLUSIONS, 'Exterior painting', 'Moving furniture'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Sơn ngoại thất', 'Di chuyển đồ đạc'],
};

// ---- Quick-only types (Phase 1) ----
const adu: JobType = {
  id: 'adu', name: 'New ADU / DADU', vi: 'Xây ADU / DADU mới', detailed: false, unit: 'SF', category: 'New construction',
  defaultPreset: { basic: 300, mid: 350, high: 425 },
  questions: [size(800, 'Finished area'), yearBuilt],
  scope: () => [],
  exclusions: [...COMMON_EXCLUSIONS, 'Architectural and engineering design', 'Utility connection and capacity charges', 'Landscaping, fencing and driveway'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Thiết kế kiến trúc và kết cấu', 'Phí đấu nối tiện ích', 'Cảnh quan, hàng rào và lối xe'],
};

const newbuild: JobType = {
  id: 'newbuild', name: 'New home build', vi: 'Xây nhà mới', detailed: false, unit: 'SF', category: 'New construction',
  defaultPreset: { basic: 250, mid: 325, high: 450 },
  questions: [size(2200, 'Finished area')],
  scope: () => [],
  exclusions: [...COMMON_EXCLUSIONS, 'Land, design, engineering and impact fees', 'Utility connection and capacity charges', 'Landscaping, fencing and driveway'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Đất, thiết kế, kỹ thuật và phí tác động', 'Phí đấu nối tiện ích', 'Cảnh quan, hàng rào và lối xe'],
};

// ---- Small job: pick any items from the price book ----
const small: JobType = {
  id: 'small', name: 'Small job / repairs', vi: 'Việc nhỏ / sửa chữa', detailed: true, unit: 'JOB', category: 'Remodel',
  defaultPreset: { basic: 0, mid: 0, high: 0 },
  questions: [yearBuilt],
  scope: () => [],
  exclusions: COMMON_EXCLUSIONS,
  exclusionsVi: COMMON_EXCLUSIONS_VI,
};

// ---- More types of work, priced per unit (Quick). Starting prices only: every contractor sets their own. ----
type Preset = Record<FinishLevel, number>;
const UNIT_QTY_LABEL: Record<PriceUnit, string> = { SF: 'SF', LF: 'LF', EA: '', JOB: '' };

/** The main-quantity question for a job priced per unit. Per-job types have none (quantity is 1). */
function mainQty(unit: PriceUnit, label: string, def: number): Question[] {
  if (unit === 'JOB') return [];
  return [{ id: 'sizeSf', label, kind: 'number', unit: UNIT_QTY_LABEL[unit] || undefined, default: def, group: 'Size' }];
}

function quick(
  id: string, name: string, vi: string, category: JobCategory, unit: PriceUnit, qtyLabel: string, def: number,
  preset: Preset, opts: { house?: boolean; exclusions?: [string, string][] } = {},
): JobType {
  const extra = opts.exclusions ?? [];
  return {
    id, name, vi, detailed: false, unit, category, defaultPreset: preset,
    questions: [...mainQty(unit, qtyLabel, def), ...(opts.house ? [yearBuilt] : [])],
    scope: () => [],
    exclusions: [...COMMON_EXCLUSIONS, ...extra.map((e) => e[0])],
    exclusionsVi: [...COMMON_EXCLUSIONS_VI, ...extra.map((e) => e[1])],
  };
}

const ROT: [string, string] = ['Replacement of rotted sheathing or framing beyond what is listed', 'Thay ván hoặc khung bị mục ngoài phạm vi đã liệt kê'];
const MORE_TYPES: JobType[] = [
  // Remodel
  quick('wholehouse', 'Whole-house remodel', 'Sửa toàn bộ nhà', 'Remodel', 'SF', 'Area being remodeled', 1500, { basic: 150, mid: 225, high: 350 }, { house: true }),
  quick('garage', 'Garage conversion', 'Chuyển đổi garage', 'Remodel', 'SF', 'Garage area', 400, { basic: 150, mid: 200, high: 275 }, { house: true }),
  quick('drywall', 'Drywall hang & finish', 'Thạch cao (lắp và hoàn thiện)', 'Remodel', 'SF', 'Board area (walls + ceilings)', 1200, { basic: 3.5, mid: 4.5, high: 6 }),
  quick('doors', 'Interior doors & trim', 'Cửa trong nhà và nẹp', 'Remodel', 'EA', 'Number of doors', 6, { basic: 450, mid: 650, high: 1100 }),
  quick('windows', 'Window replacement', 'Thay cửa sổ', 'Remodel', 'EA', 'Number of windows', 8, { basic: 900, mid: 1300, high: 2200 }, { house: true }),
  quick('countertops', 'Countertops', 'Mặt bàn đá', 'Remodel', 'SF', 'Countertop area', 50, { basic: 60, mid: 85, high: 140 }),
  quick('demolition', 'Interior demolition', 'Phá dỡ bên trong', 'Remodel', 'SF', 'Area to demo', 500, { basic: 4, mid: 6, high: 10 }, { house: true }),
  quick('insulation', 'Insulation', 'Cách nhiệt', 'Remodel', 'SF', 'Area to insulate', 1000, { basic: 1.5, mid: 2.5, high: 4 }),
  // Exterior
  quick('roofing', 'Roof replacement', 'Thay mái', 'Exterior', 'SF', 'Roof area', 2000, { basic: 7, mid: 9.5, high: 14 }, { house: true, exclusions: [ROT] }),
  quick('siding', 'Siding', 'Ốp tường ngoài (siding)', 'Exterior', 'SF', 'Wall area', 1800, { basic: 9, mid: 12, high: 18 }, { house: true, exclusions: [ROT] }),
  quick('extpaint', 'Exterior painting', 'Sơn ngoại thất', 'Exterior', 'SF', 'Wall area to paint', 2000, { basic: 3, mid: 4, high: 6 }, { house: true }),
  quick('deck', 'Deck', 'Sàn deck', 'Exterior', 'SF', 'Deck area', 300, { basic: 45, mid: 65, high: 100 }),
  quick('fence', 'Fence', 'Hàng rào', 'Exterior', 'LF', 'Fence length', 150, { basic: 45, mid: 60, high: 90 }),
  quick('gutters', 'Gutters', 'Máng xối', 'Exterior', 'LF', 'Gutter length', 150, { basic: 12, mid: 16, high: 25 }),
  quick('concrete', 'Concrete flatwork', 'Đổ bê tông (sân, lối đi)', 'Exterior', 'SF', 'Concrete area', 500, { basic: 12, mid: 16, high: 24 }),
  quick('landscape', 'Landscaping / hardscape', 'Cảnh quan / sân vườn', 'Exterior', 'SF', 'Area', 800, { basic: 15, mid: 25, high: 45 }),
  quick('retaining', 'Retaining wall', 'Tường chắn đất', 'Exterior', 'LF', 'Wall length', 40, { basic: 150, mid: 250, high: 400 }),
  // Systems & trades
  quick('panel', 'Electrical panel upgrade', 'Nâng cấp tủ điện', 'Systems & trades', 'JOB', '', 1, { basic: 3500, mid: 4500, high: 6500 }, { house: true }),
  quick('rewire', 'Whole-house rewire', 'Đi lại toàn bộ điện', 'Systems & trades', 'SF', 'Home size', 1800, { basic: 9, mid: 12, high: 16 }, { house: true }),
  quick('repipe', 'Repipe (PEX)', 'Thay toàn bộ ống nước (PEX)', 'Systems & trades', 'SF', 'Home size', 1800, { basic: 4, mid: 6, high: 9 }, { house: true }),
  quick('waterheater', 'Water heater', 'Bình nước nóng', 'Systems & trades', 'EA', 'Number of water heaters', 1, { basic: 2200, mid: 3200, high: 5500 }),
  quick('hvac', 'Heat pump / HVAC system', 'Hệ thống sưởi/điều hòa (heat pump)', 'Systems & trades', 'EA', 'Number of systems', 1, { basic: 9000, mid: 13000, high: 20000 }, { house: true }),
  // New construction
  quick('addition', 'Home addition', 'Xây thêm phòng', 'New construction', 'SF', 'Added area', 400, { basic: 300, mid: 375, high: 500 }, { house: true }),
  quick('commercial', 'Commercial tenant improvement', 'Cải tạo mặt bằng thương mại', 'New construction', 'SF', 'Space size', 2000, { basic: 60, mid: 90, high: 150 }),
];

const BUILT_IN: JobType[] = [bathroom, kitchen, basement, flooring, painting, ...MORE_TYPES, adu, newbuild, small];
const BUILT_IN_QUESTIONS = new Map(BUILT_IN.map((j) => [j.id, j.questions]));

/** Shown for an estimate whose own job type was later deleted, so old estimates never break. */
const OTHER: JobType = quick('other', 'Other work', 'Công việc khác', 'Your own work', 'JOB', '', 1, { basic: 0, mid: 0, high: 0 });

export const CATEGORY_ORDER: JobCategory[] = ['Your own work', 'Remodel', 'Exterior', 'Systems & trades', 'New construction'];
export const CATEGORY_VI: Record<JobCategory, string> = {
  'Your own work': 'Công việc riêng của bạn', Remodel: 'Sửa chữa', Exterior: 'Bên ngoài',
  'Systems & trades': 'Hệ thống và chuyên ngành', 'New construction': 'Xây mới',
};

/**
 * All job types: built-in plus the contractor's own. These are kept in place (same array and object) and
 * refreshed by setCustomJobs() whenever the contractor changes their types or questions.
 */
export const JOB_TYPES: JobType[] = [...BUILT_IN];
export const JOB_TYPE_BY_ID: Record<JobTypeId, JobType> = Object.fromEntries(BUILT_IN.map((j) => [j.id, j]));

export const isBuiltInJobType = (id: string) => BUILT_IN_QUESTIONS.has(id);

/** A contractor's own type of work as a job type. Prices come from their presets (no built-in default). */
export function customToJobType(c: CustomJobType): JobType {
  return {
    ...quick(c.id, c.name, c.name, 'Your own work', c.unit, c.unit === 'EA' ? 'How many' : c.unit === 'LF' ? 'Length' : 'Area', 0,
      { basic: 0, mid: 0, high: 0 }),
    custom: true,
  };
}

/** Rebuilds the registry from the contractor's own types and their added questions. */
export function setCustomJobs(types: CustomJobType[], questions: Record<string, Question[]>) {
  const all = [...BUILT_IN.map((j) => ({ ...j, questions: BUILT_IN_QUESTIONS.get(j.id)! })), ...types.map(customToJobType)]
    .map((j) => ({ ...j, questions: [...j.questions, ...(questions[j.id] ?? []).map((q) => ({ ...q, custom: true, group: 'Your questions' }))] }));
  // Your own types first in lists, then the built-in ones.
  JOB_TYPES.splice(0, JOB_TYPES.length, ...all.filter((j) => j.custom), ...all.filter((j) => !j.custom));
  for (const k of Object.keys(JOB_TYPE_BY_ID)) delete JOB_TYPE_BY_ID[k];
  for (const j of JOB_TYPES) JOB_TYPE_BY_ID[j.id] = j;
}

/** Look up a job type safely; unknown ids (a deleted custom type) get a generic "Other work" type. */
export function jobType(id: JobTypeId): JobType {
  return JOB_TYPE_BY_ID[id] ?? OTHER;
}

export const isJobTypeId = (v: unknown): v is JobTypeId => typeof v === 'string' && v in JOB_TYPE_BY_ID;

/** "/SF", "/LF", " each", " per job" — what a price is per. */
export function perUnit(unit: PriceUnit | undefined, lang: 'en' | 'vi' = 'en'): string {
  switch (unit ?? 'SF') {
    case 'LF': return '/LF';
    case 'EA': return lang === 'vi' ? '/cái' : ' each';
    case 'JOB': return lang === 'vi' ? '/việc' : ' per job';
    default: return '/SF';
  }
}

/** "120 SF", "150 LF", "8 items", "1 job". */
export function qtyWithUnit(qty: number, unit: PriceUnit | undefined): string {
  switch (unit ?? 'SF') {
    case 'LF': return `${qty} LF`;
    case 'EA': return `${qty} item${qty === 1 ? '' : 's'}`;
    case 'JOB': return 'per job';
    default: return `${qty} SF`;
  }
}

/** The quantity a job is priced on: the size answer, or 1 for per-job types. */
export function mainQuantity(jt: JobType, a: Answers): number {
  return jt.unit === 'JOB' ? 1 : num(a, 'sizeSf');
}

export const FINISH_LABELS: Record<FinishLevel, { en: string; vi: string }> = {
  basic: { en: 'Basic', vi: 'Cơ bản' },
  mid: { en: 'Mid-grade', vi: 'Trung bình' },
  high: { en: 'High-end', vi: 'Cao cấp' },
};

/** Material price multiplier by finish level, applied only to finish-sensitive materials. */
export const FINISH_FACTOR: Record<FinishLevel, number> = { basic: 0.75, mid: 1, high: 2.2 };

/** Labor multiplier by finish level for finish trades (tile, cabinets, trim, fixtures, paint). */
export const FINISH_LABOR_FACTOR: Record<FinishLevel, number> = { basic: 0.9, mid: 1, high: 1.3 };
export const FINISH_LABOR_TRADES = ['tile', 'cabinets', 'carpentry', 'fixtures', 'painting'];

export function defaultAnswers(jobTypeId: JobTypeId): Record<string, number | string | boolean> {
  const jt = jobType(jobTypeId);
  return Object.fromEntries(jt.questions.map((q) => [q.id, q.default]));
}
