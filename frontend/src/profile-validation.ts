/**
 * Validation shared by the participant portal forms.
 * Phone numbers must be entered in international E.164 style (+country code).
 * Length/calling-code checks intentionally reject obvious garbage; they do not
 * claim to prove that a number is assigned or reachable.
 */
const PHONE_CODES = [
  '1','7','20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49',
  '51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84','86',
  '90','91','92','93','94','95','98','211','212','213','216','218','220','221','222','223','224',
  '225','226','227','228','229','230','231','232','233','234','235','236','237','238','239','240',
  '241','242','243','244','245','246','248','249','250','251','252','253','254','255','256','257',
  '258','260','261','262','263','264','265','266','267','268','269','290','291','297','298','299',
  '350','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375',
  '376','377','378','380','381','382','383','385','386','387','389','420','421','423','500','501',
  '502','503','504','505','506','507','508','509','590','591','592','593','594','595','596','597',
  '598','599','670','672','673','674','675','676','677','678','679','680','681','682','683','685',
  '686','687','688','689','690','691','692','850','852','853','855','856','880','886','960','961',
  '962','963','964','965','966','967','968','970','971','972','973','974','975','976','977','992',
  '993','994','995','996','998'
];
const NATIONAL_LENGTHS: Record<string, [number, number]> = {
  '1':[10,10], '7':[10,10], '20':[8,10], '27':[9,9], '33':[9,9], '34':[9,9], '39':[6,11],
  '44':[9,10], '49':[7,12], '61':[9,9], '81':[9,10], '82':[8,10], '86':[11,11],
  '91':[10,10], '351':[9,9], '352':[4,11], '353':[7,10], '358':[5,12], '380':[9,9],
  '375':[9,9], '48':[9,9], '420':[9,9], '421':[9,9], '372':[7,8], '371':[8,8],
  '370':[8,8], '995':[9,9], '994':[9,9], '971':[8,9], '972':[8,9], '966':[9,9],
  '55':[10,11], '52':[10,10], '54':[10,11], '56':[9,9], '57':[10,10], '58':[10,10],
  '62':[9,12], '63':[10,10], '65':[8,8], '66':[9,9], '84':[9,10], '90':[10,10],
  '92':[10,10], '93':[9,9], '94':[9,9], '95':[7,10], '98':[10,10], '880':[10,10],
  '852':[8,8], '853':[8,8], '855':[8,9], '856':[8,10], '886':[9,9], '977':[10,10],
  '992':[9,9], '993':[8,8], '996':[9,9], '998':[9,9]
};

export function isValidInternationalPhone(value: string): boolean {
  const phone = value.trim();
  if (!phone) return true; // Optional field.
  if (!/^\+[1-9][0-9 ()().-]*$/.test(phone)) return false;
  const digits = phone.slice(1).replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || /^(\d)\1+$/.test(digits)) return false;
  const callingCode = [...PHONE_CODES].sort((a,b) => b.length-a.length).find(code => digits.startsWith(code));
  if (!callingCode) return false;
  const national = digits.length - callingCode.length;
  const [min,max] = NATIONAL_LENGTHS[callingCode] ?? [4,12];
  return national >= min && national <= max && !/^(\d)\1+$/.test(digits.slice(callingCode.length));
}

export function isValidPlate(country: string, value: string): boolean {
  let number = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!number || number.length > 16) return false;
  // Russian plates use a fixed set of Cyrillic letters. Convert Latin lookalikes
  // before validation, then validate the whole number rather than a substring.
  if (country === 'RU') {
    const lookalikes: Record<string,string> = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
    number = [...number].map(ch => lookalikes[ch] ?? ch).join('');
  }
  const patterns: Record<string,RegExp> = {
    RU:/^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/,
    NO:/^[A-Z]{2} ?\d{5}$/,
    FI:/^[A-Z]{2,3}-?\d{1,3}$/,
    EE:/^\d{3} ?[A-Z]{3}$/,
    LV:/^[A-Z]{2}-?\d{1,4}$/,
    LT:/^[A-Z]{3}-?\d{3}$/,
    PL:/^[A-Z]{1,3}[A-Z0-9]{4,7}$/,
    BY:/^\d{4} ?[A-Z]{2}-?\d{1,2}$/,
    UA:/^[A-Z]{2} ?\d{4} ?[A-Z]{2}$/,
    GE:/^[A-Z]{2}-?\d{3}-?[A-Z]{2}$/,
    AZ:/^\d{2}-?[A-Z]{2}-?\d{3}$/,
    KZ:/^\d{3} ?[A-Z]{1,3} ?\d{2,3}$/,
    CN:/^[A-Z][A-Z0-9] ?[A-Z0-9]{5}$/,
    MN:/^\d{4} ?[A-Z]{2,3}$/,
    KP:/^(?=.*[A-Z0-9])[A-Z0-9 -]{3,10}$/,
    // US formats are state-specific; reject punctuation and enforce 2–8 chars.
    US:/^[A-Z0-9][A-Z0-9 -]{1,7}$/
  };
  return Boolean(patterns[country]?.test(number));
}
