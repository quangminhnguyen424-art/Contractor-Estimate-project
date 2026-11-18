import type { AduReason, AduResult, CheckKey, RuleKey, Verdict } from './adu';

/**
 * The words for an ADU check, in English and Vietnamese: used by the homeowner's web page and by the app.
 * Kept here (not in the app's dictionary) because the web page has no translator.
 */
export type AduLang = 'en' | 'vi';

const EN = {
  verdict: {
    yes: 'Looks possible: rules for this zone generally allow ADUs',
    likely: 'Likely allowed: state law requires cities to allow ADUs on lots like this',
    check: 'Needs a closer look with your city',
    no: 'Probably not allowed on this lot',
  } as Record<Verdict, string>,
  reason: {
    'seattle-res': 'Your lot is in a Seattle Neighborhood Residential zone, where two ADUs per lot are allowed: a backyard cottage (DADU), an ADU in or attached to the house (AADU), or one of each.',
    'seattle-lowrise': 'Your lot is in a Seattle Lowrise zone, where ADUs are allowed with the house.',
    'seattle-other': 'Your lot is not in a Seattle residential zone. ADUs may still be possible but depend on the zone.',
    'state-law': 'Washington law (HB 1337) requires your city to allow at least two ADUs on a residential lot like this one. Your city’s own code sets setbacks, height and lot coverage.',
    rural: 'This lot is in rural unincorporated King County. One ADU is usually possible, with stricter limits, septic and well rules.',
    'not-res': 'The lot’s zoning is not residential, so an ADU is not usually allowed.',
    multi: 'The county lists this property as a condo or apartment building. ADUs are for lots with a house.',
    'unknown-zone': 'We could not read this lot’s zoning, so we can’t say for sure.',
    'small-lot': 'The lot is small: an ADU in or attached to the house (basement, garage, addition) may fit better than a separate cottage.',
  } as Record<AduReason, string>,
  rule: {
    adus: (v: string) => `ADUs per lot: ${v} (attached, detached, or one of each)`,
    size: (v: string) => v.includes('|') ? `Size: up to ${v.split('|')[0]} SF, or ${v.split('|')[1]} SF with 3 or more bedrooms` : `Size: your city cannot cap an ADU below ${v} SF`,
    height: (v: string) => `Height: up to ${v} ft (more with a pitched roof)`,
    rear: (v: string) => `Rear setback: ${v} ft (0 ft where the lot backs onto an alley)`,
    side: (v: string) => `Side setbacks: ${v.split('|')[0]} ft on average, at least ${v.split('|')[1]} ft`,
    between: (v: string) => `Between buildings: at least ${v} ft`,
    coverage: (v: string) => `Lot coverage: about ${v}% of the lot for all buildings`,
    homes: (v: string) => `Homes on the lot: up to ${v.split('|')[0]} under Seattle’s middle-housing rules (${v.split('|')[1]} near major transit or with two affordable homes)`,
    lotMin: () => 'No minimum lot size',
    owner: () => 'The owner does not have to live on the property',
    parking: () => 'No parking space required',
  } as Record<RuleKey, (v: string) => string>,
  check: {
    critical: 'Steep slopes, wetlands, creeks or landslide areas on or near the lot (they limit what can be built)',
    trees: 'Large trees (many cities, Seattle included, protect them; removing one may need a permit and replacement)',
    utilities: 'Sewer, water and power: where the lines run and whether they have room for another home',
    covenants: 'HOA rules or recorded covenants that may limit building',
    cityCode: 'Your city’s zoning code for this lot (setbacks, height, lot coverage)',
    transit: 'Distance to a major transit stop (more homes are allowed within a quarter mile)',
    septic: 'Septic system and well capacity',
    survey: 'A survey to confirm lot lines and setbacks before design',
  } as Record<CheckKey, string>,
  beds: (b: number) => (b === 1 ? '1 bedroom' : `${b} bedrooms`),
};

const VI: typeof EN = {
  verdict: {
    yes: 'Có vẻ được: luật của khu này thường cho phép ADU',
    likely: 'Nhiều khả năng được: luật tiểu bang yêu cầu thành phố cho phép ADU trên lô như thế này',
    check: 'Cần hỏi thêm thành phố',
    no: 'Có lẽ không được phép trên lô này',
  },
  reason: {
    'seattle-res': 'Lô của bạn nằm trong vùng Neighborhood Residential của Seattle, được xây 2 ADU mỗi lô: nhà sau vườn (DADU), ADU trong hoặc nối với nhà (AADU), hoặc mỗi loại một căn.',
    'seattle-lowrise': 'Lô của bạn nằm trong vùng Lowrise của Seattle, được xây ADU cùng với nhà chính.',
    'seattle-other': 'Lô của bạn không nằm trong vùng nhà ở của Seattle. Vẫn có thể xây ADU nhưng tùy theo vùng.',
    'state-law': 'Luật tiểu bang Washington (HB 1337) bắt buộc thành phố cho phép ít nhất 2 ADU trên lô nhà ở như lô này. Khoảng lùi, chiều cao và tỉ lệ xây dựng do luật thành phố quy định.',
    rural: 'Lô này thuộc vùng nông thôn King County. Thường được xây 1 ADU, với giới hạn chặt hơn và quy định về hầm tự hoại, giếng nước.',
    'not-res': 'Lô này không phải đất nhà ở, nên thường không được xây ADU.',
    multi: 'Quận ghi bất động sản này là condo hoặc chung cư. ADU dành cho lô có nhà riêng.',
    'unknown-zone': 'Chúng tôi chưa đọc được zoning của lô này nên chưa thể khẳng định.',
    'small-lot': 'Lô khá nhỏ: ADU trong hoặc nối với nhà (tầng hầm, garage, xây thêm) có thể hợp hơn nhà riêng sau vườn.',
  },
  rule: {
    adus: (v) => `Số ADU mỗi lô: ${v} (trong nhà, nhà riêng, hoặc mỗi loại một căn)`,
    size: (v) => v.includes('|') ? `Diện tích: tối đa ${v.split('|')[0]} SF, hoặc ${v.split('|')[1]} SF nếu có từ 3 phòng ngủ` : `Diện tích: thành phố không được giới hạn ADU dưới ${v} SF`,
    height: (v) => `Chiều cao: tối đa ${v} ft (cao hơn nếu mái dốc)`,
    rear: (v) => `Khoảng lùi phía sau: ${v} ft (0 ft nếu sau lô là hẻm)`,
    side: (v) => `Khoảng lùi hai bên: trung bình ${v.split('|')[0]} ft, ít nhất ${v.split('|')[1]} ft`,
    between: (v) => `Khoảng cách giữa các căn: ít nhất ${v} ft`,
    coverage: (v) => `Tỉ lệ xây dựng: khoảng ${v}% diện tích lô cho tất cả các căn`,
    homes: (v) => `Số căn nhà trên lô: tối đa ${v.split('|')[0]} theo luật middle housing của Seattle (${v.split('|')[1]} nếu gần trạm giao thông lớn hoặc có 2 căn giá rẻ)`,
    lotMin: () => 'Không yêu cầu diện tích lô tối thiểu',
    owner: () => 'Chủ nhà không bắt buộc phải ở trên lô',
    parking: () => 'Không bắt buộc chỗ đậu xe',
  },
  check: {
    critical: 'Dốc, đất ngập nước, suối hoặc vùng sạt lở trên hoặc gần lô (sẽ giới hạn việc xây)',
    trees: 'Cây lớn (nhiều thành phố, kể cả Seattle, bảo vệ cây lớn; chặt có thể cần xin phép và trồng bù)',
    utilities: 'Đường cống, nước, điện: đi ở đâu và có đủ cho thêm một căn không',
    covenants: 'Luật HOA hoặc cam kết ghi trên giấy tờ nhà có thể giới hạn việc xây',
    cityCode: 'Luật zoning của thành phố cho lô này (khoảng lùi, chiều cao, tỉ lệ xây dựng)',
    transit: 'Khoảng cách tới trạm giao thông lớn (trong vòng 1/4 dặm được xây nhiều căn hơn)',
    septic: 'Hầm tự hoại và công suất giếng nước',
    survey: 'Đo đạc (survey) để xác định ranh giới lô và khoảng lùi trước khi thiết kế',
  },
  beds: (b) => `${b} phòng ngủ`,
};

export const aduWords = (lang: AduLang) => (lang === 'vi' ? VI : EN);

export function aduRules(r: AduResult, lang: AduLang): string[] {
  const w = aduWords(lang);
  return r.rules.map((x) => w.rule[x.key](x.value));
}
