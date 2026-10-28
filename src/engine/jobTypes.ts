import type { Answers, FinishLevel, JobType, JobTypeId, Question, ScopeItem } from './types';

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
  id: 'bathroom', name: 'Bathroom remodel', vi: 'Sửa phòng tắm', detailed: true,
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
  id: 'kitchen', name: 'Kitchen remodel', vi: 'Sửa bếp', detailed: true,
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
  id: 'basement', name: 'Basement / ADU conversion', vi: 'Cải tạo tầng hầm / ADU', detailed: true,
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
  id: 'flooring', name: 'Flooring', vi: 'Lát sàn', detailed: true,
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
  id: 'painting', name: 'Interior painting', vi: 'Sơn nội thất', detailed: true,
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
  id: 'adu', name: 'New ADU / DADU', vi: 'Xây ADU / DADU mới', detailed: false,
  defaultPreset: { basic: 300, mid: 350, high: 425 },
  questions: [size(800, 'Finished area'), yearBuilt],
  scope: () => [],
  exclusions: [...COMMON_EXCLUSIONS, 'Architectural and engineering design', 'Utility connection and capacity charges', 'Landscaping, fencing and driveway'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Thiết kế kiến trúc và kết cấu', 'Phí đấu nối tiện ích', 'Cảnh quan, hàng rào và lối xe'],
};

const newbuild: JobType = {
  id: 'newbuild', name: 'New home build', vi: 'Xây nhà mới', detailed: false,
  defaultPreset: { basic: 250, mid: 325, high: 450 },
  questions: [size(2200, 'Finished area')],
  scope: () => [],
  exclusions: [...COMMON_EXCLUSIONS, 'Land, design, engineering and impact fees', 'Utility connection and capacity charges', 'Landscaping, fencing and driveway'],
  exclusionsVi: [...COMMON_EXCLUSIONS_VI, 'Đất, thiết kế, kỹ thuật và phí tác động', 'Phí đấu nối tiện ích', 'Cảnh quan, hàng rào và lối xe'],
};

// ---- Small job: pick any items from the price book ----
const small: JobType = {
  id: 'small', name: 'Small job / repairs', vi: 'Việc nhỏ / sửa chữa', detailed: true,
  defaultPreset: { basic: 0, mid: 0, high: 0 },
  questions: [yearBuilt],
  scope: () => [],
  exclusions: COMMON_EXCLUSIONS,
  exclusionsVi: COMMON_EXCLUSIONS_VI,
};

export const JOB_TYPES: JobType[] = [bathroom, kitchen, basement, flooring, painting, adu, newbuild, small];
export const JOB_TYPE_BY_ID = Object.fromEntries(JOB_TYPES.map((j) => [j.id, j])) as Record<JobTypeId, JobType>;

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
  const jt = JOB_TYPE_BY_ID[jobTypeId];
  return Object.fromEntries(jt.questions.map((q) => [q.id, q.default]));
}
