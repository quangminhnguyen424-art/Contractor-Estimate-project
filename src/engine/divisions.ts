import type { JobTypeId } from './types';

/**
 * New construction is priced per square foot, but the quote shows the work part by part, the way a builder's
 * quote does: general conditions, site work, foundation, framing… each with what it includes and its share of the
 * price. The shares come from Upgrade Home's own DADU quote (Shoreline, Oct 2026, 850 SF at $325/SF); the porch
 * and trellis line of that job is left out, since most jobs have none (the contractor can add it in the wording).
 */
export interface Division { key: string; en: string; vi: string; share: number; items: string[]; itemsVi: string[] }

// Amounts from the reference quote; shares are worked out from them below.
const TABLE: (Omit<Division, 'share'> & { amount: number })[] = [
  { key: 'd-general', en: 'General conditions', vi: 'Chi phí chung', amount: 14500,
    items: ['Project management, permit coordination and inspections', 'Temporary toilet and power, dumpsters, insurance', 'Daily and final cleanup'],
    itemsVi: ['Quản lý dự án, lo giấy phép và các lần kiểm tra', 'Nhà vệ sinh và điện tạm, thùng rác, bảo hiểm', 'Dọn dẹp hằng ngày và lần cuối'] },
  { key: 'd-site', en: 'Site work', vi: 'San lấp mặt bằng', amount: 9500,
    items: ['Erosion control and layout', 'Excavation, grading and backfill', 'Haul-off of spoils'],
    itemsVi: ['Chống xói mòn và định vị', 'Đào, san nền và lấp đất', 'Chở đất thải đi'] },
  { key: 'd-utilities', en: 'Utilities & side sewer', vi: 'Tiện ích và cống thoát', amount: 18500,
    items: ['Side sewer to the city connection, cleanouts per code', 'Water and power trenching and connections'],
    itemsVi: ['Đường cống ra điểm nối của thành phố, lỗ thông theo quy định', 'Đào rãnh và đấu nối nước, điện'] },
  { key: 'd-foundation', en: 'Foundation', vi: 'Móng', amount: 24000,
    items: ['Footings and stem walls per structural plans, hold-downs and anchors', 'Slab on grade over insulation and vapor barrier', 'Footing drain and waterproofing'],
    itemsVi: ['Móng và tường móng theo bản vẽ kết cấu, bu lông neo', 'Sàn bê tông trên lớp cách nhiệt và chống ẩm', 'Ống thoát nước chân móng và chống thấm'] },
  { key: 'd-framing', en: 'Framing', vi: 'Dựng khung', amount: 38000,
    items: ['2x6 exterior and 2x4 interior walls, shear walls and hardware', 'Beams, floor and roof framing, sheathing', 'Stair framing'],
    itemsVi: ['Tường ngoài 2x6, tường trong 2x4, tường chịu cắt và phụ kiện', 'Dầm, khung sàn và mái, ván ốp', 'Khung cầu thang'] },
  { key: 'd-roofing', en: 'Roofing', vi: 'Mái', amount: 17500,
    items: ['Roofing per plans with underlayment and flashing', 'Gutters and downspouts'],
    itemsVi: ['Lợp mái theo bản vẽ, lớp lót và tôn chắn nước', 'Máng xối và ống xả'] },
  { key: 'd-openings', en: 'Windows & exterior doors', vi: 'Cửa sổ và cửa ngoài', amount: 18000,
    items: ['All windows per the window schedule', 'Entry and exterior doors, installed and flashed'],
    itemsVi: ['Toàn bộ cửa sổ theo bảng cửa', 'Cửa chính và cửa ngoài, lắp đặt và chắn nước'] },
  { key: 'd-envelope', en: 'Exterior envelope', vi: 'Vỏ ngoài', amount: 22500,
    items: ['Weather-resistive barrier and rainscreen', 'Siding, trim and soffits', 'Exterior paint'],
    itemsVi: ['Lớp chống thời tiết và khe thoát nước', 'Siding, nẹp và trần hiên', 'Sơn ngoài'] },
  { key: 'd-insulation', en: 'Insulation', vi: 'Cách nhiệt', amount: 7500,
    items: ['Wall and roof insulation to energy code', 'Air sealing'],
    itemsVi: ['Cách nhiệt tường và mái theo quy chuẩn năng lượng', 'Bịt kín khe hở'] },
  { key: 'd-plumbing', en: 'Plumbing', vi: 'Ống nước', amount: 19500,
    items: ['Rough-in and finish plumbing', 'Water heater', 'Fixtures: shower, toilet, sinks and faucets, hose bibs'],
    itemsVi: ['Đi ống thô và hoàn thiện', 'Bình nước nóng', 'Thiết bị: buồng tắm, bồn cầu, bồn rửa và vòi, vòi ngoài trời'] },
  { key: 'd-mechanical', en: 'Mechanical', vi: 'Sưởi và thông gió', amount: 15500,
    items: ['Heat pump heating and cooling', 'Ventilation and exhaust fans'],
    itemsVi: ['Hệ thống sưởi và làm mát heat pump', 'Thông gió và quạt hút'] },
  { key: 'd-electrical', en: 'Electrical', vi: 'Điện', amount: 17500,
    items: ['Service or subpanel, rough and finish wiring', 'Light fixtures per plan, smoke and CO detectors', 'Exterior lighting'],
    itemsVi: ['Nguồn điện hoặc panel phụ, đi dây thô và hoàn thiện', 'Đèn theo bản vẽ, báo khói và CO', 'Đèn ngoài trời'] },
  { key: 'd-drywall', en: 'Drywall & interior paint', vi: 'Drywall và sơn trong', amount: 13500,
    items: ['Hang, tape and finish drywall', 'Prime and paint walls and ceilings'],
    itemsVi: ['Đóng, dán băng và trét drywall', 'Sơn lót và sơn tường, trần'] },
  { key: 'd-cabinets', en: 'Cabinets & countertops', vi: 'Tủ và mặt bàn', amount: 16000,
    items: ['Kitchen cabinets and countertops', 'Bathroom vanity'],
    itemsVi: ['Tủ bếp và mặt bàn', 'Tủ vanity phòng tắm'] },
  { key: 'd-flooring', en: 'Flooring & tile', vi: 'Sàn và gạch', amount: 9000,
    items: ['Finish flooring throughout', 'Bathroom tile'],
    itemsVi: ['Sàn hoàn thiện toàn bộ', 'Gạch phòng tắm'] },
  { key: 'd-finish', en: 'Interior finish carpentry', vi: 'Mộc hoàn thiện trong nhà', amount: 8750,
    items: ['Interior and closet doors, trim', 'Stair treads, guardrail and handrail'],
    itemsVi: ['Cửa trong nhà và cửa tủ âm tường, nẹp chỉ', 'Bậc cầu thang, lan can và tay vịn'] },
];

const SUM = TABLE.reduce((t, d) => t + d.amount, 0);
export const DIVISIONS: Division[] = TABLE.map(({ amount, ...d }) => ({ ...d, share: amount / SUM }));

/** The job types quoted part by part. */
const WITH_DIVISIONS = new Set<JobTypeId>(['adu', 'newbuild', 'addition']);
export const hasDivisions = (id: JobTypeId) => WITH_DIVISIONS.has(id);

/**
 * A price split into the divisions, in whole dollars, adding up to the price exactly (the remainder goes to the
 * largest share, framing).
 */
export function splitDivisions(price: number): Record<string, number> {
  const out: Record<string, number> = {};
  let used = 0;
  let largest = DIVISIONS[0];
  for (const d of DIVISIONS) {
    out[d.key] = Math.floor(price * d.share);
    used += out[d.key];
    if (d.share > largest.share) largest = d;
  }
  out[largest.key] = Math.round((out[largest.key] + price - used) * 100) / 100;
  return out;
}
