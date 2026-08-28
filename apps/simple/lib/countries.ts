/**
 * Countries, two ways: the free text a person types into the country question
 * turned into an ISO-3166 alpha-2 code, and the alpha-3 codes the NCD-RisC
 * files use turned into the same thing.
 *
 * ponytail: the names come from `Intl.DisplayNames`, which ships with Node and
 * the browser, so the only table here is the alpha-3 pairing that ICU does not
 * expose. Aliases cover the handful of endonyms and nicknames people actually
 * type.
 */

/** ISO 3166-1 alpha-3 to alpha-2, from the ISO 3166 standard list. */
const ISO3 =
  "ABW:AW,AFG:AF,AGO:AO,AIA:AI,ALA:AX,ALB:AL,AND:AD,ARE:AE,ARG:AR,ARM:AM,AS" +
    "M:AS,ATA:AQ,ATF:TF,ATG:AG,AUS:AU,AUT:AT,AZE:AZ,BDI:BI,BEL:BE,BEN:BJ,BES:" +
    "BQ,BFA:BF,BGD:BD,BGR:BG,BHR:BH,BHS:BS,BIH:BA,BLM:BL,BLR:BY,BLZ:BZ,BMU:BM" +
    ",BOL:BO,BRA:BR,BRB:BB,BRN:BN,BTN:BT,BVT:BV,BWA:BW,CAF:CF,CAN:CA,CCK:CC,C" +
    "HE:CH,CHL:CL,CHN:CN,CIV:CI,CMR:CM,COD:CD,COG:CG,COK:CK,COL:CO,COM:KM,CPV" +
    ":CV,CRI:CR,CUB:CU,CUW:CW,CXR:CX,CYM:KY,CYP:CY,CZE:CZ,DEU:DE,DJI:DJ,DMA:D" +
    "M,DNK:DK,DOM:DO,DZA:DZ,ECU:EC,EGY:EG,ERI:ER,ESH:EH,ESP:ES,EST:EE,ETH:ET," +
    "FIN:FI,FJI:FJ,FLK:FK,FRA:FR,FRO:FO,FSM:FM,GAB:GA,GBR:GB,GEO:GE,GGY:GG,GH" +
    "A:GH,GIB:GI,GIN:GN,GLP:GP,GMB:GM,GNB:GW,GNQ:GQ,GRC:GR,GRD:GD,GRL:GL,GTM:" +
    "GT,GUF:GF,GUM:GU,GUY:GY,HKG:HK,HMD:HM,HND:HN,HRV:HR,HTI:HT,HUN:HU,IDN:ID" +
    ",IMN:IM,IND:IN,IOT:IO,IRL:IE,IRN:IR,IRQ:IQ,ISL:IS,ISR:IL,ITA:IT,JAM:JM,J" +
    "EY:JE,JOR:JO,JPN:JP,KAZ:KZ,KEN:KE,KGZ:KG,KHM:KH,KIR:KI,KNA:KN,KOR:KR,KWT" +
    ":KW,LAO:LA,LBN:LB,LBR:LR,LBY:LY,LCA:LC,LIE:LI,LKA:LK,LSO:LS,LTU:LT,LUX:L" +
    "U,LVA:LV,MAC:MO,MAF:MF,MAR:MA,MCO:MC,MDA:MD,MDG:MG,MDV:MV,MEX:MX,MHL:MH," +
    "MKD:MK,MLI:ML,MLT:MT,MMR:MM,MNE:ME,MNG:MN,MNP:MP,MOZ:MZ,MRT:MR,MSR:MS,MT" +
    "Q:MQ,MUS:MU,MWI:MW,MYS:MY,MYT:YT,NAM:NA,NCL:NC,NER:NE,NFK:NF,NGA:NG,NIC:" +
    "NI,NIU:NU,NLD:NL,NOR:NO,NPL:NP,NRU:NR,NZL:NZ,OMN:OM,PAK:PK,PAN:PA,PCN:PN" +
    ",PER:PE,PHL:PH,PLW:PW,PNG:PG,POL:PL,PRI:PR,PRK:KP,PRT:PT,PRY:PY,PSE:PS,P" +
    "YF:PF,QAT:QA,REU:RE,ROU:RO,RUS:RU,RWA:RW,SAU:SA,SDN:SD,SEN:SN,SGP:SG,SGS" +
    ":GS,SHN:SH,SJM:SJ,SLB:SB,SLE:SL,SLV:SV,SMR:SM,SOM:SO,SPM:PM,SRB:RS,SSD:S" +
    "S,STP:ST,SUR:SR,SVK:SK,SVN:SI,SWE:SE,SWZ:SZ,SXM:SX,SYC:SC,SYR:SY,TCA:TC," +
    "TCD:TD,TGO:TG,THA:TH,TJK:TJ,TKL:TK,TKM:TM,TLS:TL,TON:TO,TTO:TT,TUN:TN,TU" +
    "R:TR,TUV:TV,TWN:TW,TZA:TZ,UGA:UG,UKR:UA,UMI:UM,URY:UY,USA:US,UZB:UZ,VAT:" +
    "VA,VCT:VC,VEN:VE,VGB:VG,VIR:VI,VNM:VN,VUT:VU,WLF:WF,WSM:WS,YEM:YE,ZAF:ZA" +
    ",ZMB:ZM,ZWE:ZW";

const BY_ISO3 = new Map(
  ISO3.split(",").map((pair) => pair.split(":") as [string, string]),
);

export const fromIso3 = (code: string): string | null =>
  BY_ISO3.get(code.trim().toUpperCase()) ?? null;

/** Endonyms and nicknames `Intl.DisplayNames` will not answer to. */
const ALIASES: Record<string, string> = {
  romania: "RO",
  "rom\u00e2nia": "RO",
  uk: "GB",
  "united kingdom": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  britain: "GB",
  "great britain": "GB",
  usa: "US",
  us: "US",
  america: "US",
  "united states": "US",
  deutschland: "DE",
  espana: "ES",
  "espa\u00f1a": "ES",
  italia: "IT",
  nederland: "NL",
  holland: "NL",
  polska: "PL",
  magyarorszag: "HU",
  "magyarorsz\u00e1g": "HU",
  suomi: "FI",
  sverige: "SE",
  norge: "NO",
  danmark: "DK",
  osterreich: "AT",
  "\u00f6sterreich": "AT",
  schweiz: "CH",
  suisse: "CH",
  turkiye: "TR",
  "t\u00fcrkiye": "TR",
  hellas: "GR",
  ellada: "GR",
  moldova: "MD",
  uae: "AE",
  "south korea": "KR",
  "north korea": "KP",
  russia: "RU",
  vietnam: "VN",
  czechia: "CZ",
  "czech republic": "CZ",
};

let byName: Map<string, string> | null = null;

/** Every alpha-2 code by its English name, built once from ICU. */
function names(): Map<string, string> {
  if (byName) return byName;
  byName = new Map();
  const display = new Intl.DisplayNames(["en"], { type: "region" });
  for (const code of new Set(BY_ISO3.values())) {
    try {
      const name = display.of(code);
      if (name && name !== code) byName.set(name.toLowerCase(), code);
    } catch {
      // ICU does not know this region; the alias table can still cover it.
    }
  }
  return byName;
}

/** "Romania", "ro", "R\u00f4mania " \u2192 "RO". Null when nothing matches. */
export function toCountryCode(raw: unknown): string | null {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFC");
  if (!text) return null;
  if (/^[a-z]{2}$/.test(text)) {
    const upper = text.toUpperCase();
    return [...BY_ISO3.values()].includes(upper) ? upper : null;
  }
  if (/^[a-z]{3}$/.test(text)) return fromIso3(text);
  return ALIASES[text] ?? names().get(text) ?? null;
}

/** The country's English name, for the page. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
