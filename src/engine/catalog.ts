import type { Assembly, Material, Trade } from './types';

// Default prices are typical Seattle-area big-box retail (Oct 2026), pre-tax.
// Every contractor can override any price or labor rate in their Price Book.

export const MATERIALS: Material[] = [
  // Lumber & framing
  { id: 'stud_2x4x8', name: '2x4x8 stud', unit: 'ea', price: 4.25, category: 'Lumber & framing' },
  { id: 'plate_2x4x12', name: '2x4x12 (top plate)', unit: 'ea', price: 7.5, category: 'Lumber & framing' },
  { id: 'pt_2x4x12', name: '2x4x12 pressure-treated (bottom plate)', unit: 'ea', price: 10.5, category: 'Lumber & framing' },
  { id: 'header_2x6x8', name: '2x6x8 (door header)', unit: 'ea', price: 7.25, category: 'Lumber & framing' },
  { id: 'framing_nails', name: '3-1/4" collated framing nails (2,000)', unit: 'box', price: 45, category: 'Lumber & framing' },
  { id: 'pa_pins', name: 'Powder-actuated pins + loads (100)', unit: 'set', price: 38, category: 'Lumber & framing' },

  // Drywall
  { id: 'drywall_sheet', name: '1/2" drywall 4x8', unit: 'sheet', price: 16.5, category: 'Drywall' },
  { id: 'drywall_mr_sheet', name: '1/2" moisture-resistant drywall 4x8', unit: 'sheet', price: 21, category: 'Drywall' },
  { id: 'insulation_r15', name: 'R-15 batt insulation (bag, ~60 SF)', unit: 'bag', price: 65, category: 'Drywall' },
  { id: 'drywall_screws', name: '1-1/4" drywall screws, 5 lb', unit: 'box', price: 28, category: 'Drywall' },
  { id: 'joint_compound', name: 'All-purpose joint compound, 4.5 gal', unit: 'box', price: 19.5, category: 'Drywall' },
  { id: 'paper_tape', name: 'Paper tape, 500 ft', unit: 'roll', price: 6.5, category: 'Drywall' },
  { id: 'corner_bead', name: 'Outside corner bead, 8 ft', unit: 'ea', price: 4.25, category: 'Drywall' },

  // Plumbing
  { id: 'abs_3', name: '3" ABS pipe, 10 ft', unit: 'ea', price: 34, category: 'Plumbing' },
  { id: 'abs_2', name: '2" ABS pipe, 10 ft', unit: 'ea', price: 19.5, category: 'Plumbing' },
  { id: 'abs_15', name: '1-1/2" ABS pipe, 10 ft', unit: 'ea', price: 14, category: 'Plumbing' },
  { id: 'abs_fittings', name: 'ABS fittings kit (per fixture)', unit: 'kit', price: 45, category: 'Plumbing' },
  { id: 'abs_cement', name: 'ABS cement, 16 oz', unit: 'can', price: 13, category: 'Plumbing' },
  { id: 'ptrap_2', name: '2" P-trap', unit: 'ea', price: 9.5, category: 'Plumbing' },
  { id: 'trap_15', name: '1-1/2" P-trap + trap adapter', unit: 'ea', price: 8.5, category: 'Plumbing' },
  { id: 'closet_flange', name: '3" closet flange', unit: 'ea', price: 14, category: 'Plumbing' },
  { id: 'wax_ring', name: 'Toilet wax ring + bolts', unit: 'ea', price: 8, category: 'Plumbing' },
  { id: 'aav', name: 'Air admittance valve', unit: 'ea', price: 22, category: 'Plumbing' },
  { id: 'pex_half', name: '1/2" PEX, 100 ft', unit: 'roll', price: 42, category: 'Plumbing' },
  { id: 'pex_34', name: '3/4" PEX, 50 ft', unit: 'roll', price: 48, category: 'Plumbing' },
  { id: 'pex_fittings', name: 'PEX fittings + rings kit (per fixture)', unit: 'kit', price: 35, category: 'Plumbing' },
  { id: 'angle_stop', name: '1/4-turn angle stop', unit: 'ea', price: 11, category: 'Plumbing' },
  { id: 'shower_valve', name: 'Shower rough-in valve', unit: 'ea', price: 95, category: 'Plumbing' },
  { id: 'washer_box', name: 'Washer box with valves', unit: 'ea', price: 65, category: 'Plumbing' },
  { id: 'icemaker_box', name: 'Ice maker box + line', unit: 'set', price: 45, category: 'Plumbing' },
  { id: 'concrete_80', name: '80 lb concrete mix', unit: 'bag', price: 7.25, category: 'Plumbing' },
  { id: 'gravel_50', name: 'Pea gravel / sand, 50 lb', unit: 'bag', price: 6.5, category: 'Plumbing' },

  // Electrical
  { id: 'wire_63', name: '6/3 NM-B copper (cut to length)', unit: 'ft', price: 6.25, category: 'Electrical' },
  { id: 'wire_103', name: '10/3 NM-B copper (cut to length)', unit: 'ft', price: 2.35, category: 'Electrical' },
  { id: 'wire_142', name: '14/2 NM-B, 250 ft', unit: 'roll', price: 95, category: 'Electrical' },
  { id: 'wire_122', name: '12/2 NM-B, 250 ft', unit: 'roll', price: 135, category: 'Electrical' },
  { id: 'breaker_20', name: '20A breaker', unit: 'ea', price: 12, category: 'Electrical' },
  { id: 'breaker_50', name: '50A 2-pole breaker', unit: 'ea', price: 22, category: 'Electrical' },
  { id: 'breaker_30', name: '30A 2-pole breaker', unit: 'ea', price: 18, category: 'Electrical' },
  { id: 'afci_breaker', name: 'AFCI / dual-function breaker', unit: 'ea', price: 55, category: 'Electrical' },
  { id: 'recept_1450', name: 'NEMA 14-50 range receptacle + box', unit: 'set', price: 28, category: 'Electrical' },
  { id: 'recept_1430', name: 'NEMA 14-30 dryer receptacle + box', unit: 'set', price: 25, category: 'Electrical' },
  { id: 'box_1g', name: 'New-work box, single gang', unit: 'ea', price: 1.5, category: 'Electrical' },
  { id: 'switch_sp', name: 'Single-pole switch', unit: 'ea', price: 3.5, category: 'Electrical' },
  { id: 'duplex', name: 'Duplex receptacle, tamper-resistant', unit: 'ea', price: 3, category: 'Electrical' },
  { id: 'gfci', name: 'GFCI receptacle', unit: 'ea', price: 22, category: 'Electrical' },
  { id: 'cover_plate', name: 'Cover plate', unit: 'ea', price: 1.25, category: 'Electrical' },
  { id: 'wafer_light', name: 'Recessed LED wafer light', unit: 'ea', price: 18, category: 'Electrical' },
  { id: 'smoke_co', name: 'Smoke/CO combo detector (hardwired)', unit: 'ea', price: 48, category: 'Electrical' },
  { id: 'elec_misc', name: 'Wire nuts, staples, clamps', unit: 'lot', price: 30, category: 'Electrical' },

  // Ventilation
  { id: 'bath_fan', name: 'Bath exhaust fan, 80 CFM', unit: 'ea', price: 110, category: 'Ventilation' },
  { id: 'fan_duct_kit', name: '4" duct + wall cap (bath fan)', unit: 'set', price: 35, category: 'Ventilation' },
  { id: 'hood_duct_kit', name: '6" range hood duct, elbows + wall cap', unit: 'set', price: 66, category: 'Ventilation' },
  { id: 'dryer_vent_kit', name: '4" rigid dryer duct + wall vent', unit: 'set', price: 46, category: 'Ventilation' },

  // Tile & flooring
  { id: 'tile', name: 'Porcelain tile', unit: 'SF', price: 2.75, category: 'Tile & flooring', finishSensitive: true },
  { id: 'thinset', name: 'Modified thinset, 50 lb', unit: 'bag', price: 28, category: 'Tile & flooring' },
  { id: 'grout', name: 'Grout, 25 lb', unit: 'bag', price: 24, category: 'Tile & flooring' },
  { id: 'leveler', name: 'Self-leveler, 50 lb', unit: 'bag', price: 42, category: 'Tile & flooring' },
  { id: 'tile_spacers', name: 'Spacers / leveling clips', unit: 'bag', price: 22, category: 'Tile & flooring' },
  { id: 'cement_board', name: 'Cement board 3x5', unit: 'sheet', price: 14, category: 'Tile & flooring' },
  { id: 'membrane', name: 'Waterproofing membrane', unit: 'SF', price: 2.2, category: 'Tile & flooring' },
  { id: 'shower_pan_kit', name: 'Shower pan kit (sloped pan, curb, drain)', unit: 'kit', price: 380, category: 'Tile & flooring', finishSensitive: true },
  { id: 'uncoupling', name: 'Uncoupling membrane (tile over wood subfloor)', unit: 'SF', price: 1.9, category: 'Tile & flooring' },
  { id: 'lvp', name: 'Luxury vinyl plank (LVP)', unit: 'SF', price: 3.2, category: 'Tile & flooring', finishSensitive: true },
  { id: 'transition', name: 'Transition strip', unit: 'ea', price: 22, category: 'Tile & flooring' },

  // Cabinets & counters
  { id: 'cabinet_lf', name: 'Kitchen cabinets (per LF)', unit: 'LF', price: 250, category: 'Cabinets & counters', finishSensitive: true },
  { id: 'countertop_sf', name: 'Countertop, fabricated + installed', unit: 'SF', price: 75, category: 'Cabinets & counters', finishSensitive: true },

  // Doors & trim
  { id: 'door_30', name: '30" prehung interior door', unit: 'ea', price: 135, category: 'Doors & trim', finishSensitive: true },
  { id: 'bifold', name: 'Bifold door', unit: 'ea', price: 95, category: 'Doors & trim', finishSensitive: true },
  { id: 'knob', name: 'Door knob set', unit: 'ea', price: 22, category: 'Doors & trim', finishSensitive: true },
  { id: 'casing', name: 'Door casing, primed MDF', unit: 'LF', price: 1.15, category: 'Doors & trim' },
  { id: 'baseboard', name: 'Baseboard, primed MDF', unit: 'LF', price: 1.3, category: 'Doors & trim' },
  { id: 'shims', name: 'Door shims', unit: 'bundle', price: 5, category: 'Doors & trim' },
  { id: 'finish_nails', name: 'Finish nails', unit: 'box', price: 14, category: 'Doors & trim' },

  // Paint
  { id: 'primer', name: 'PVA drywall primer', unit: 'gal', price: 18, category: 'Paint' },
  { id: 'paint_5gal', name: 'Wall paint, 5 gal', unit: 'bucket', price: 165, category: 'Paint', finishSensitive: true },
  { id: 'caulk', name: 'Paintable caulk', unit: 'tube', price: 5.5, category: 'Paint' },

  // Fixtures (contractor-supplied)
  { id: 'toilet', name: 'Toilet', unit: 'ea', price: 280, category: 'Fixtures', finishSensitive: true },
  { id: 'vanity', name: 'Vanity with top', unit: 'ea', price: 450, category: 'Fixtures', finishSensitive: true },
  { id: 'faucet', name: 'Faucet', unit: 'ea', price: 150, category: 'Fixtures', finishSensitive: true },
  { id: 'shower_stall', name: 'Shower stall 3x3', unit: 'ea', price: 650, category: 'Fixtures', finishSensitive: true },
  { id: 'shower_trim', name: 'Shower trim kit', unit: 'ea', price: 180, category: 'Fixtures', finishSensitive: true },
  { id: 'tub', name: 'Bathtub, 60"', unit: 'ea', price: 450, category: 'Fixtures', finishSensitive: true },
  { id: 'kitchen_sink', name: 'Kitchen sink', unit: 'ea', price: 250, category: 'Fixtures', finishSensitive: true },

  // Site & disposal
  { id: 'haul_load', name: 'Dump / haul-off', unit: 'load', price: 350, category: 'Site & disposal' },
  { id: 'floor_protection', name: 'Floor protection (Ram Board)', unit: 'roll', price: 65, category: 'Site & disposal' },
  { id: 'plastic_sheeting', name: 'Plastic sheeting', unit: 'roll', price: 25, category: 'Site & disposal' },
  { id: 'painters_tape', name: "Painter's tape", unit: 'roll', price: 7.5, category: 'Site & disposal' },
];

const m = (materialId: string, perUnit: number) => ({ materialId, perUnit });

export const ASSEMBLIES: Assembly[] = [
  // Demo
  { id: 'demo_wall', name: 'Remove interior wall', vi: 'Phá dỡ tường', trade: 'demo', unit: 'LF', labor: 25, materials: [m('haul_load', 0.04)] },
  { id: 'demo_bath', name: 'Bathroom demolition', vi: 'Phá dỡ phòng tắm', trade: 'demo', unit: 'EA', labor: 1200, materials: [m('haul_load', 1)] },
  { id: 'demo_kitchen', name: 'Kitchen demolition', vi: 'Phá dỡ bếp', trade: 'demo', unit: 'EA', labor: 1800, materials: [m('haul_load', 1.5)] },
  { id: 'demo_floor', name: 'Remove existing flooring', vi: 'Gỡ sàn cũ', trade: 'demo', unit: 'SF', labor: 2, materials: [m('haul_load', 0.003)] },

  // Framing
  { id: 'frame_wall', name: 'Frame new interior wall (8 ft)', vi: 'Dựng khung tường mới (8 ft)', trade: 'framing', unit: 'LF', labor: 40,
    materials: [m('stud_2x4x8', 1.1), m('plate_2x4x12', 0.17), m('pt_2x4x12', 0.09), m('framing_nails', 0.02), m('pa_pins', 0.02)] },
  { id: 'finish_exterior_wall', name: 'Frame, insulate and drywall exterior wall', vi: 'Dựng khung, cách nhiệt và ốp thạch cao tường ngoài', trade: 'framing', unit: 'LF', labor: 70,
    materials: [m('stud_2x4x8', 0.8), m('plate_2x4x12', 0.17), m('pt_2x4x12', 0.09), m('insulation_r15', 0.135), m('drywall_sheet', 0.275), m('drywall_screws', 0.015), m('joint_compound', 0.035), m('paper_tape', 0.035)] },
  { id: 'frame_opening', name: 'Frame door opening with header', vi: 'Khung lỗ cửa và lanh tô', trade: 'framing', unit: 'EA', labor: 75,
    materials: [m('header_2x6x8', 1), m('stud_2x4x8', 2)] },

  // Drywall
  { id: 'drywall_hang', name: 'Hang drywall, new wall (both sides)', vi: 'Lắp thạch cao tường mới (hai mặt)', trade: 'drywall', unit: 'LF', labor: 33,
    materials: [m('drywall_sheet', 0.55), m('drywall_screws', 0.025)] },
  { id: 'drywall_finish', name: 'Tape, mud and texture, new wall', vi: 'Băng keo, trét và tạo vân tường mới', trade: 'drywall', unit: 'LF', labor: 55,
    materials: [m('joint_compound', 0.065), m('paper_tape', 0.065), m('corner_bead', 0.18)] },
  { id: 'drywall_wet_room', name: 'Moisture-resistant drywall, bathroom', vi: 'Thạch cao chống ẩm phòng tắm', trade: 'drywall', unit: 'EA', labor: 450,
    materials: [m('drywall_mr_sheet', 8), m('drywall_screws', 0.3), m('joint_compound', 0.5), m('paper_tape', 0.5)] },
  { id: 'drywall_patch', name: 'Drywall patch and repair', vi: 'Vá sửa thạch cao', trade: 'drywall', unit: 'EA', labor: 150,
    materials: [m('drywall_sheet', 0.5), m('joint_compound', 0.25), m('paper_tape', 0.2)] },

  // Plumbing
  { id: 'plumb_shower', name: 'Shower drain, valve and supply', vi: 'Ống thoát, van và cấp nước vòi sen', trade: 'plumbing', unit: 'EA', labor: 1300,
    materials: [m('abs_2', 1), m('abs_fittings', 1), m('pex_fittings', 1), m('pex_half', 0.2), m('shower_valve', 1), m('ptrap_2', 1), m('abs_cement', 0.25)] },
  { id: 'plumb_tub', name: 'Tub drain, valve and supply', vi: 'Ống thoát, van và cấp nước bồn tắm', trade: 'plumbing', unit: 'EA', labor: 1100,
    materials: [m('abs_15', 1), m('abs_fittings', 1), m('pex_fittings', 1), m('pex_half', 0.2), m('shower_valve', 1), m('abs_cement', 0.25)] },
  { id: 'plumb_toilet', name: 'Toilet drain and supply (new location)', vi: 'Ống thoát và cấp nước bồn cầu (vị trí mới)', trade: 'plumbing', unit: 'EA', labor: 800,
    materials: [m('abs_3', 1), m('abs_fittings', 1), m('pex_fittings', 0.5), m('pex_half', 0.1), m('closet_flange', 1), m('abs_cement', 0.25)] },
  { id: 'plumb_vanity', name: 'Vanity drain and supply (new location)', vi: 'Ống thoát và cấp nước lavabo (vị trí mới)', trade: 'plumbing', unit: 'EA', labor: 700,
    materials: [m('abs_15', 0.5), m('abs_fittings', 1), m('pex_fittings', 1), m('pex_half', 0.1), m('abs_cement', 0.25)] },
  { id: 'plumb_kitchen_sink', name: 'Kitchen sink drain and supply', vi: 'Ống thoát và cấp nước bồn rửa bếp', trade: 'plumbing', unit: 'EA', labor: 800,
    materials: [m('abs_15', 1), m('abs_fittings', 1), m('pex_fittings', 1), m('pex_half', 0.2), m('aav', 1), m('abs_cement', 0.25)] },
  { id: 'plumb_dishwasher', name: 'Dishwasher hookup', vi: 'Đấu nối máy rửa chén', trade: 'plumbing', unit: 'EA', labor: 250, materials: [m('angle_stop', 1)] },
  { id: 'plumb_washer', name: 'Washer box, drain and supply', vi: 'Hộp máy giặt, ống thoát và cấp nước', trade: 'plumbing', unit: 'EA', labor: 700,
    materials: [m('washer_box', 1), m('abs_2', 1), m('abs_fittings', 1), m('pex_fittings', 1), m('pex_half', 0.1), m('ptrap_2', 1)] },
  { id: 'plumb_icemaker', name: 'Ice maker line for fridge', vi: 'Đường nước tủ lạnh làm đá', trade: 'plumbing', unit: 'EA', labor: 300,
    materials: [m('icemaker_box', 1), m('pex_fittings', 0.5)] },
  { id: 'plumb_supply_run', name: 'Water supply run from source', vi: 'Đường cấp nước chính', trade: 'plumbing', unit: 'LF', labor: 12,
    materials: [m('pex_34', 0.02), m('pex_half', 0.02)] },
  { id: 'slab_trench', name: 'Cut slab, trench and patch for drains', vi: 'Cắt sàn bê tông, đào rãnh và vá lại', trade: 'plumbing', unit: 'LF', labor: 60,
    materials: [m('concrete_80', 0.6), m('gravel_50', 0.3), m('abs_3', 0.1)] },
  { id: 'install_toilet', name: 'Set toilet', vi: 'Lắp bồn cầu', trade: 'fixtures', unit: 'EA', labor: 200, materials: [m('wax_ring', 1), m('angle_stop', 1)] },
  { id: 'install_vanity', name: 'Install vanity and faucet', vi: 'Lắp lavabo và vòi', trade: 'fixtures', unit: 'EA', labor: 350, materials: [m('trap_15', 1), m('angle_stop', 2)] },
  { id: 'install_shower_stall', name: 'Install shower stall', vi: 'Lắp buồng tắm đứng', trade: 'fixtures', unit: 'EA', labor: 500, materials: [] },
  { id: 'install_sink', name: 'Install kitchen sink and faucet', vi: 'Lắp bồn rửa và vòi bếp', trade: 'fixtures', unit: 'EA', labor: 300, materials: [m('trap_15', 1), m('angle_stop', 2)] },

  // Fixtures supplied by contractor (no labor; install is separate)
  { id: 'supply_toilet', name: 'Toilet (supplied)', vi: 'Bồn cầu (cung cấp)', trade: 'fixtures', unit: 'EA', labor: 0, materials: [m('toilet', 1)] },
  { id: 'supply_vanity', name: 'Vanity and faucet (supplied)', vi: 'Lavabo và vòi (cung cấp)', trade: 'fixtures', unit: 'EA', labor: 0, materials: [m('vanity', 1), m('faucet', 1)] },
  { id: 'supply_shower_stall', name: 'Shower stall (supplied)', vi: 'Buồng tắm đứng (cung cấp)', trade: 'fixtures', unit: 'EA', labor: 0, materials: [m('shower_stall', 1), m('shower_trim', 1)] },
  { id: 'supply_shower_trim', name: 'Shower trim kit (supplied)', vi: 'Bộ vòi sen (cung cấp)', trade: 'fixtures', unit: 'EA', labor: 0, materials: [m('shower_trim', 1)] },
  { id: 'supply_tub', name: 'Bathtub (supplied)', vi: 'Bồn tắm (cung cấp)', trade: 'fixtures', unit: 'EA', labor: 0, materials: [m('tub', 1)] },
  { id: 'supply_kitchen_sink', name: 'Kitchen sink and faucet (supplied)', vi: 'Bồn rửa và vòi bếp (cung cấp)', trade: 'fixtures', unit: 'EA', labor: 0, materials: [m('kitchen_sink', 1), m('faucet', 1)] },

  // Electrical
  { id: 'elec_range_50a', name: '50A range circuit', vi: 'Mạch điện bếp 50A', trade: 'electrical', unit: 'EA', labor: 650, materials: [m('breaker_50', 1), m('recept_1450', 1)] },
  { id: 'elec_run_63', name: '6/3 wire run for range', vi: 'Dây 6/3 cho bếp', trade: 'electrical', unit: 'LF', labor: 2, materials: [m('wire_63', 1)] },
  { id: 'elec_dryer_30a', name: '30A dryer circuit', vi: 'Mạch điện máy sấy 30A', trade: 'electrical', unit: 'EA', labor: 450, materials: [m('breaker_30', 1), m('recept_1430', 1)] },
  { id: 'elec_run_103', name: '10/3 wire run for dryer', vi: 'Dây 10/3 cho máy sấy', trade: 'electrical', unit: 'LF', labor: 1.5, materials: [m('wire_103', 1)] },
  { id: 'elec_light', name: 'Add light (recessed LED)', vi: 'Thêm đèn (LED âm trần)', trade: 'electrical', unit: 'EA', labor: 120, materials: [m('wafer_light', 1), m('wire_142', 0.1)] },
  { id: 'elec_switch', name: 'Add or move switch', vi: 'Thêm hoặc dời công tắc', trade: 'electrical', unit: 'EA', labor: 90,
    materials: [m('box_1g', 1), m('switch_sp', 1), m('cover_plate', 1), m('wire_142', 0.04)] },
  { id: 'elec_outlet', name: 'Add outlet', vi: 'Thêm ổ cắm', trade: 'electrical', unit: 'EA', labor: 85,
    materials: [m('box_1g', 1), m('duplex', 1), m('cover_plate', 1), m('wire_122', 0.1)] },
  { id: 'elec_gfci', name: 'Add GFCI outlet', vi: 'Thêm ổ cắm GFCI', trade: 'electrical', unit: 'EA', labor: 110,
    materials: [m('box_1g', 1), m('gfci', 1), m('cover_plate', 1), m('wire_122', 0.1)] },
  { id: 'elec_20a_circuit', name: 'New 20A circuit (kitchen, bath or appliance)', vi: 'Mạch điện 20A mới (bếp, phòng tắm hoặc thiết bị)', trade: 'electrical', unit: 'EA', labor: 250,
    materials: [m('breaker_20', 1), m('wire_122', 0.2)] },
  { id: 'elec_bedroom_circuit', name: 'New AFCI bedroom circuit', vi: 'Mạch AFCI phòng ngủ mới', trade: 'electrical', unit: 'EA', labor: 200,
    materials: [m('afci_breaker', 1), m('wire_122', 0.4)] },
  { id: 'elec_smoke', name: 'Smoke/CO detector, hardwired', vi: 'Báo khói/CO nối điện', trade: 'electrical', unit: 'EA', labor: 75,
    materials: [m('smoke_co', 1), m('box_1g', 1), m('wire_142', 0.08)] },
  { id: 'elec_misc', name: 'Electrical misc. and modifications', vi: 'Điện linh tinh và điều chỉnh', trade: 'electrical', unit: 'EA', labor: 300, materials: [m('elec_misc', 1)] },

  // Ventilation
  { id: 'vent_bath_fan', name: 'Bath exhaust fan, vented outside', vi: 'Quạt hút phòng tắm, thoát ra ngoài', trade: 'ventilation', unit: 'EA', labor: 250,
    materials: [m('bath_fan', 1), m('fan_duct_kit', 1), m('switch_sp', 1), m('box_1g', 1), m('cover_plate', 1), m('wire_142', 0.1)] },
  { id: 'vent_range_hood', name: 'Range hood vent to exterior', vi: 'Ống thoát máy hút mùi ra ngoài', trade: 'ventilation', unit: 'EA', labor: 500, materials: [m('hood_duct_kit', 1)] },
  { id: 'vent_dryer', name: 'Dryer vent to exterior', vi: 'Ống thoát máy sấy ra ngoài', trade: 'ventilation', unit: 'EA', labor: 200, materials: [m('dryer_vent_kit', 1)] },

  // Tile & flooring
  { id: 'tile_floor', name: 'Tile floor', vi: 'Lát gạch sàn', trade: 'tile', unit: 'SF', labor: 14,
    materials: [m('tile', 1.1), m('thinset', 0.03), m('grout', 0.02), m('leveler', 0.02), m('tile_spacers', 0.01)] },
  { id: 'tile_shower_wall', name: 'Tile shower walls, waterproofed', vi: 'Ốp gạch tường tắm, chống thấm', trade: 'tile', unit: 'SF', labor: 20,
    materials: [m('tile', 1.1), m('thinset', 0.035), m('grout', 0.02), m('cement_board', 0.07), m('membrane', 1)] },
  { id: 'shower_pan', name: 'Shower pan, curb and drain, waterproofed', vi: 'Đế sàn tắm, gờ chắn và ống thoát, chống thấm', trade: 'tile', unit: 'EA', labor: 650,
    materials: [m('shower_pan_kit', 1), m('thinset', 0.3)] },
  { id: 'tile_underlayment', name: 'Uncoupling membrane under tile (wood subfloor)', vi: 'Màng lót dưới gạch (sàn gỗ)', trade: 'tile', unit: 'SF', labor: 2,
    materials: [m('uncoupling', 1.05), m('thinset', 0.02)] },
  { id: 'tile_backsplash', name: 'Tile backsplash', vi: 'Ốp gạch tường bếp', trade: 'tile', unit: 'SF', labor: 16,
    materials: [m('tile', 1.1), m('thinset', 0.02), m('grout', 0.015)] },
  { id: 'lvp_floor', name: 'LVP floor', vi: 'Sàn vinyl LVP', trade: 'tile', unit: 'SF', labor: 3, materials: [m('lvp', 1.08)] },
  { id: 'floor_transition', name: 'Floor transition strip', vi: 'Nẹp chuyển sàn', trade: 'tile', unit: 'EA', labor: 25, materials: [m('transition', 1)] },

  // Cabinets & counters
  { id: 'cabinet_install', name: 'Install cabinets', vi: 'Lắp tủ', trade: 'cabinets', unit: 'LF', labor: 150, materials: [] },
  { id: 'cabinet_supply', name: 'Cabinets (supplied)', vi: 'Tủ bếp (cung cấp)', trade: 'cabinets', unit: 'LF', labor: 0, materials: [m('cabinet_lf', 1)] },
  { id: 'countertop', name: 'Countertops, fabricated and installed', vi: 'Mặt bàn, gia công và lắp đặt', trade: 'cabinets', unit: 'SF', labor: 0, materials: [m('countertop_sf', 1)] },

  // Carpentry
  { id: 'door_interior', name: 'Install 30" prehung door with trim', vi: 'Lắp cửa 30" kèm khung và nẹp', trade: 'carpentry', unit: 'EA', labor: 250,
    materials: [m('door_30', 1), m('knob', 1), m('casing', 34), m('shims', 0.3), m('finish_nails', 0.1)] },
  { id: 'door_bifold', name: 'Install bifold door with trim', vi: 'Lắp cửa xếp kèm nẹp', trade: 'carpentry', unit: 'EA', labor: 180,
    materials: [m('bifold', 1), m('casing', 17), m('finish_nails', 0.05)] },
  { id: 'baseboard', name: 'Baseboard', vi: 'Len chân tường', trade: 'carpentry', unit: 'LF', labor: 3,
    materials: [m('baseboard', 1.05), m('caulk', 0.02), m('finish_nails', 0.005)] },

  // Painting
  { id: 'paint_new_wall', name: 'Prime and paint new wall (both sides)', vi: 'Sơn lót và sơn tường mới (hai mặt)', trade: 'painting', unit: 'LF', labor: 33,
    materials: [m('primer', 0.07), m('paint_5gal', 0.022), m('caulk', 0.1)] },
  { id: 'paint_room', name: 'Paint walls (per SF of floor area)', vi: 'Sơn tường (theo SF diện tích sàn)', trade: 'painting', unit: 'SF', labor: 2.2,
    materials: [m('primer', 0.01), m('paint_5gal', 0.004), m('caulk', 0.01)] },
  { id: 'paint_ceiling', name: 'Paint ceilings', vi: 'Sơn trần', trade: 'painting', unit: 'SF', labor: 1.2, materials: [m('paint_5gal', 0.002)] },

  // General
  { id: 'site_protection', name: 'Floor and wall protection, dust control', vi: 'Bảo vệ sàn, tường và chống bụi', trade: 'general', unit: 'EA', labor: 400,
    materials: [m('floor_protection', 2), m('plastic_sheeting', 1), m('painters_tape', 4)] },
  { id: 'cleanup_final', name: 'Final cleanup', vi: 'Dọn dẹp hoàn công', trade: 'general', unit: 'EA', labor: 450, materials: [] },
];

export const MATERIAL_BY_ID: Record<string, Material> = Object.fromEntries(MATERIALS.map((x) => [x.id, x]));
export const ASSEMBLY_BY_ID: Record<string, Assembly> = Object.fromEntries(ASSEMBLIES.map((x) => [x.id, x]));

export const TRADE_ORDER: Trade[] = [
  'general', 'demo', 'framing', 'plumbing', 'electrical', 'ventilation', 'drywall',
  'tile', 'cabinets', 'fixtures', 'carpentry', 'painting',
];

export const TRADE_NAMES: Record<Trade, { en: string; vi: string }> = {
  demo: { en: 'Demolition', vi: 'Phá dỡ' },
  framing: { en: 'Framing', vi: 'Dựng khung' },
  drywall: { en: 'Drywall', vi: 'Thạch cao' },
  plumbing: { en: 'Plumbing', vi: 'Hệ thống nước' },
  electrical: { en: 'Electrical', vi: 'Hệ thống điện' },
  ventilation: { en: 'Ventilation', vi: 'Thông gió' },
  tile: { en: 'Tile & flooring', vi: 'Gạch & sàn' },
  cabinets: { en: 'Cabinets & counters', vi: 'Tủ & mặt bàn' },
  carpentry: { en: 'Doors & trim', vi: 'Cửa & nẹp' },
  painting: { en: 'Painting', vi: 'Sơn' },
  fixtures: { en: 'Fixtures & install', vi: 'Thiết bị & lắp đặt' },
  general: { en: 'Site protection & cleanup', vi: 'Bảo vệ công trình & dọn dẹp' },
};
