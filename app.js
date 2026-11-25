const el = id => document.getElementById(id);
const moneyKeys = ['year','gross','tax','manualRate','deductionChoice','cap','included','actualSocial'];
const feeDefinitions = [
  ['health', 'Heilsutrygd'], ['parental', 'Barsilsskipan'], ['broadcast', 'Kringvarp'],
  ['unemployment', 'Arbeiðsloysisskipan (ALS)'], ['ameg', 'AMEG'], ['church', 'Kirkjuskattur'],
];
const fees = feeDefinitions.map(([id, title]) => {
  const card = document.createElement('div');
  card.className = 'fee';
  card.innerHTML = `<label>${title}<select id="${id}"><option value="no">Nei</option><option value="yes">Ja</option></select></label><small></small><output for="${id}"></output>`;
  el('feeFields').append(card);
  const select = el(id);
  select.value = id === 'broadcast' ? 'yes' : 'no';
  return {id, select, output: card.querySelector('output'), description: card.querySelector('small')};
});
let churchRates = church2026;
let publicFees = {};
let deductionRates = null;
let foreignRate = 35;
function populateMunicipalities(current = '', village = '') {
  const names = [...new Set([...Object.keys(church2026), ...Object.keys(churchRates), current].filter(Boolean))];
  const select = el('municipality');
  select.replaceChildren(new Option('Vel kommunu', ''));
  for (const name of names.sort((a, b) => a.localeCompare(b, 'fo'))) select.add(new Option(name, name));
  select.value = current;
  populateVillages(village);
}
function populateVillages(current = '') {
  const villages = churchRates[el('municipality').value]?.[1];
  const select = el('village');
  select.replaceChildren(new Option('Vel bygd ella bý', ''));
  if (villages) {
    for (const name of Object.keys(villages)) select.add(new Option(name, name));
    select.add(new Option('Annað stað í kommununi', 'other'));
  }
  if ([...select.options].some(option => option.value === current)) select.value = current;
}
const names = 'Januar Februar Mars Apríl Mai Juni Juli August September Oktober November Desember'.split(' ');
names.forEach((name, index) => el('month').add(new Option(name, String(index))));
const ytdFields = ['ytdGross', 'ytdTax', 'ytdSocial'].map(el);
const monthlyEntries = Object.create(null);
const ytdEntries = Object.create(null);
const monthKey = () => el('year').value + '-' + el('month').value;
function loadYtdTotals() {
  const entry = ytdEntries[monthKey()];
  ytdFields.forEach(field => { field.value = typeof entry?.[field.id] === 'string' ? entry[field.id] : ''; });
}
const ytdRows = names.map((name, index) => {
  const row = el('ytdRows').insertRow();
  row.insertCell().textContent = name;
  const fields = ['monthGross', 'monthTax'].map(key => {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '.01';
    input.setAttribute('aria-label', name + (key === 'monthGross' ? ' · bruttoløn í NOK' : ' · skattatrekk í NOK'));
    input.addEventListener('input', () => {
      const entryKey = el('year').value + '-' + index;
      monthlyEntries[entryKey] = {...monthlyEntries[entryKey], [key]: input.value};
      update();
      saveInputs();
    });
    row.insertCell().append(input);
    return input;
  });
  return {row, fields};
});
function loadYtd() {
  ytdRows.forEach(({fields}, index) => {
    const entry = monthlyEntries[el('year').value + '-' + index];
    fields[0].value = entry?.monthGross ?? '';
    fields[1].value = entry?.monthTax ?? '';
  });
}
const format = new Intl.NumberFormat('da-DK', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const round = amount => Math.round(amount * 100) / 100;
const storageKey = 'skattakalendari-2026';
const outputs = ['monthly','annual','net','foGross','withheldDkk','noNet','deduction','taxable','foTax','socialPaid','credit','rest','allFees'];
const months = names.map((name, index) => {
  const row = el('months').insertRow();
  row.insertCell().textContent = name;
  const plan = row.insertCell();
  const saved = document.createElement('input');
  saved.type = 'number';
  saved.min = '0';
  saved.step = '.01';
  saved.id = 'saved' + index;
  saved.setAttribute('aria-label', name + ' · sett av í DKK');
  row.insertCell().append(saved);
  return {plan, saved, remaining: row.insertCell()};
});
const inputs = [...moneyKeys.map(el), el('period'), el('month'), el('ytdSource'), el('municipality'), el('village'), ...fees.map(fee => fee.select), ...months.map(month => month.saved)];
const yearInput = el('year');
const currentYear = Math.max(2026, Number(new Intl.DateTimeFormat('en', {
  year: 'numeric', timeZone: 'Atlantic/Faroe',
}).format(new Date())));
yearInput.replaceChildren();
for (let year = 2026; year <= currentYear + 1; year++) yearInput.add(new Option(String(year), String(year)));
yearInput.value = String(currentYear);
const yearInputs = inputs.filter(input => input !== yearInput);
const defaultInputs = Object.fromEntries(yearInputs.map(input => [input.id, input.value]));
const recordsByYear = Object.create(null);
const ratesByYear = Object.create(null);
let activeYear = yearInput.value;
let selectedVillage = '';
let taksRequest = 0;

function loadYear() {
  const record = recordsByYear[yearInput.value] ?? {};
  for (const input of yearInputs) {
    if (input.id === 'municipality' || input.id === 'village') continue;
    input.value = typeof record[input.id] === 'string' ? record[input.id] : defaultInputs[input.id];
  }
  const choice = record.deductionChoice;
  if (!choice) {
    if (record.deductionMode === 'standard') el('deductionChoice').value = 'standard';
    const legacyCap = !record.deductionMode && typeof record.cap === 'string'
      && record.cap.trim() && Number(record.cap) !== 48000;
    if (record.deductionMode === 'custom' || legacyCap) el('deductionChoice').value = 'custom';
  }
  if (record.period === 'month') {
    el('period').value = 'ytd';
    el('ytdSource').value = 'itemized';
  }
  if (record.manualRate === undefined && Number(record.rate) > 0 && Number(record.rate) !== .7) {
    el('manualRate').value = record.rate;
  }
  selectedVillage = typeof record.village === 'string' ? record.village : '';
  populateMunicipalities(typeof record.municipality === 'string' ? record.municipality : '', selectedVillage);
  loadYtdTotals();
  loadYtd();
}
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (stored.recordsByYear) Object.assign(recordsByYear, stored.recordsByYear);
  else if (Object.keys(stored).length) recordsByYear[/^20\d{2}$/.test(stored.year ?? '') ? stored.year : '2026'] = stored;
  Object.assign(monthlyEntries, stored.monthlyEntries);
  Object.assign(ytdEntries, stored.ytdEntries);
  Object.assign(ratesByYear, stored.ratesByYear);
} catch {}
loadYear();

let norwayRate = 7.6;
let exchangeRate = null;
let exchangeStatus = '';
let exchangeRequest = 0;
function update() {
  const year = el('year').value;
  el('headingYear').textContent = year;
  const mode = el('period').value;
  const ytdMode = mode === 'ytd';
  const ytdItemized = ytdMode && el('ytdSource').value === 'itemized';
  const ytdTotalsMode = ytdMode && !ytdItemized;
  const annualMode = !ytdMode;
  const monthIndex = Number(el('month').value);
  const monthName = names[monthIndex];
  const monthCount = ytdMode ? monthIndex + 1 : 12;
  const fraction = monthCount / 12;
  const periodLabel = ytdMode && monthIndex > 0 ? 'Januar–' + monthName : monthName;
  el('monthRow').hidden = annualMode;
  el('monthLabel').textContent = ytdMode ? 'Til og við' : 'Mánaður';
  for (const id of ['annualInputs', 'annualSocialRow', 'calendar']) el(id).hidden = !annualMode;
  el('ytdOptions').hidden = !ytdMode;
  el('ytdInputs').hidden = !ytdItemized;
  el('ytdTotals').hidden = !ytdTotalsMode;
  el('ytdSocialRow').hidden = !ytdTotalsMode;
  ytdRows.forEach(({row}, index) => { row.hidden = index > monthIndex; });
  el('monthlyLabel').textContent = annualMode ? 'DKK at seta av pr. mánað' : 'DKK at seta av pr. mánað · ' + periodLabel;
  el('reserveLabel').textContent = annualMode ? 'DKK at seta av um árið' : 'DKK at seta av · ' + periodLabel;
  el('netLabel').textContent = annualMode ? 'DKK eftir skatt og gjøld um árið' : 'DKK eftir skatt og gjøld · ' + periodLabel;
  const grossField = el(ytdTotalsMode ? 'ytdGross' : 'gross');
  const withholding = el(ytdTotalsMode ? 'ytdTax' : 'tax');
  const selectedRows = ytdItemized ? ytdRows.slice(0, monthCount) : [];
  const missing = selectedRows.flatMap(({fields}, index) =>
    fields.some(field => !field.validity.valid || !Number.isFinite(field.valueAsNumber)) ? [names[index]] : []);
  const gross = ytdItemized ? selectedRows.reduce((sum, {fields}) => sum + fields[0].valueAsNumber, 0) : grossField.valueAsNumber;
  const withheld = ytdItemized ? selectedRows.reduce((sum, {fields}) => sum + fields[1].valueAsNumber, 0) : withholding.valueAsNumber;
  const manualRate = el('manualRate');
  const rate = manualRate.value === '' ? exchangeRate : manualRate.valueAsNumber;
  const fxValid = Number.isFinite(rate) && rate > 0 && manualRate.validity.valid;
  el('fxStatus').textContent = manualRate.value === '' ? exchangeStatus
    : fxValid ? 'Egin kursur · ' + rate.toLocaleString('da-DK', {maximumFractionDigits: 6}) + ' DKK/NOK'
    : 'Skriva ein galdandi kurs.';
  const deductionChoice = el('deductionChoice').value;
  const capField = el('cap');
  const customCap = deductionChoice === 'custom';
  const cap = customCap ? capField.valueAsNumber
    : deductionChoice === 'transition' ? deductionRates?.special
    : deductionChoice === 'standard' ? deductionRates?.standard : Number(deductionChoice);
  el('customCapRow').hidden = !customCap;
  const capValid = deductionChoice !== '' && Number.isFinite(cap) && (!customCap || capField.validity.valid);
  el('deductionLimit').textContent = capValid
    ? 'Loft: ' + format.format(cap) + ' DKK/ár · ' + format.format(cap / 12) + ' DKK/mðr.'
    : 'Einki váttað loft tøkt fyri skattaárið.';
  const status = el('included').value;
  const override = el(ytdTotalsMode ? 'ytdSocial' : 'actualSocial');
  const getSavedSocial = index => monthlyEntries[year + '-' + index]?.monthSocial;
  const needsRate = status !== 'exempt' && (ytdItemized
    ? selectedRows.some((_, index) => !getSavedSocial(index))
    : override.value === '');
  const social = status === 'exempt' ? 0 : ytdItemized
    ? selectedRows.reduce((sum, {fields}, index) => sum + (getSavedSocial(index)
      ? Number(getSavedSocial(index)) : round(fields[0].valueAsNumber * norwayRate / 100)), 0)
    : needsRate ? round(gross * norwayRate / 100) : override.valueAsNumber;
  const norwegianIncomeTax = withheld - (status === 'yes' ? social : 0);
  const outlay = withheld + (status === 'no' ? social : 0);
  const parish = churchRates[el('municipality').value];
  const churchEnabled = el('church').value === 'yes';
  el('villageRow').hidden = !parish?.[1];
  const village = el('village').value;
  const churchRate = parish?.[1]?.[village] ?? parish?.[0];
  const villageMissing = Boolean(parish?.[1] && !village);
  const churchMissing = churchEnabled && (!parish || villageMissing);
  el('churchRateRow').hidden = !parish;
  if (parish) {
    const rates = [parish[0], ...Object.values(parish[1] ?? {})];
    const displayRate = villageMissing
      ? format.format(Math.min(...rates)) + '–' + format.format(Math.max(...rates)) + ' % · vel bygd ella bý'
      : format.format(churchRate) + ' %';
    el('churchRate').textContent = 'Kirkjuskattur: ' + displayRate;
  }
  const missingFees = fees.filter(fee => fee.select.value === 'yes' && fee.id !== 'church' && !publicFees[fee.id]);
  const invalid = (ytdItemized ? missing.length > 0 : !grossField.validity.valid || !withholding.validity.valid)
    || !Number.isFinite(gross) || !fxValid
    || !capValid || !Number.isFinite(withheld)
    || (status !== 'exempt' && (ytdItemized ? !Number.isFinite(social) || social < 0 : !override.validity.valid)) || (needsRate && norwayRate === null)
    || outlay > gross || norwegianIncomeTax < 0 || churchMissing || missingFees.length > 0;
  el('error').hidden = !invalid || (!ytdItemized && (grossField.value === '' || withholding.value === ''));
  el('error').textContent = missing.length ? 'Skriva løn og skattatrekk fyri: ' + missing.join(', ') + '.'
    : churchMissing ? Object.keys(churchRates).length
      ? 'Vel kommunu og møguliga bygd ella bý fyri at rokna kirkjuskatt.'
      : 'Kirkjuskattasatsir frá TAKS eru ikki tøkir fyri ' + year + '.'
    : missingFees.length ? 'Ein ella fleiri valdar gjaldssatsir frá TAKS eru ikki tøkir fyri ' + year + '.'
    : needsRate && norwayRate === null ? 'Norski satsurin er ikki tøkur fyri árið. Skriva veruliga folketrygd undir Kursur, frádráttur og norsk trygd.'
    : !fxValid ? 'Bíða eftir miðalkursinum ella skriva tín egna kurs undir Kursur, frádráttur og norsk trygd.'
    : !capValid ? 'Kanna loftið fyri uttanlandsfrádrátt.'
    : invalid ? 'Kanna bruttoløn, norskt trekk og folketrygd.' : '';
  el('feeNote').textContent = 'Kirkjuskattur og prosentgjøld verða mett av skattskyldugari løn eftir § 25 b-frádrátt.';
  const foGross = gross * rate;
  const noNet = (gross - outlay) * rate;
  const deduction = annualMode ? Math.min(foGross * (deductionRates?.percent ?? 30) / 100, cap) : round(cap / 12 * monthCount);
  const taxable = Math.max(0, foGross - deduction);
  el('foreignRateLabel').textContent = 'Munur upp til ' + format.format(foreignRate) + ' %';
  const foTax = round(taxable * foreignRate / 100);
  const withheldDkk = withheld * rate;
  const withheldPercent = taxable > 0 ? withheldDkk / taxable * 100 : 0;
  const socialPercent = status === 'yes'
    ? needsRate && (!ytdItemized || selectedRows.every((_, index) => !getSavedSocial(index)))
      ? norwayRate : gross > 0 ? social / gross * 100 : 0
    : 0;
  const creditPercent = taxable > 0
    ? Math.max(0, withheldPercent - socialPercent)
    : 0;
  const restPercent = taxable > 0 ? Math.max(0, foreignRate - creditPercent) : 0;
  const credit = round(Math.min(foTax, taxable * creditPercent / 100));
  const rest = round(Math.max(0, foTax - credit));
  for (const [id, percent] of Object.entries({withheldPercent, creditPercent, restPercent})) {
    el(id).textContent = invalid || !Number.isFinite(percent) ? '–' : format.format(percent) + ' %';
  }
  let allFees = 0;
  for (const {id, select, output, description} of fees) {
    const enabled = select.value === 'yes';
    const fee = publicFees[id];
    description.textContent = id === 'church' ? 'Satsur eftir bústaði'
      : fee ? [fee[0] ? format.format(fee[0]) + ' DKK/mðr.' : '', fee[1] ? format.format(fee[1]) + ' %' : ''].filter(Boolean).join(' + ')
      : 'Satsur ikki tøkur fyri ' + year;
    const amount = !enabled ? 0 : id === 'church' ? round(taxable * churchRate / 100)
      : fee ? round(fee[0] * monthCount + taxable * fee[1] / 100) : 0;
    const rateLabel = id === 'church' && enabled && !churchMissing ? ' · ' + format.format(churchRate) + ' %' : '';
    output.textContent = enabled && invalid ? '–' : format.format(amount) + (ytdMode ? ' DKK' : ' DKK/ár') + rateLabel;
    allFees += amount;
  }
  const reserve = round(rest + allFees);
  const totals = {monthly: reserve / monthCount, annual: reserve, net: noNet - reserve, foGross, withheldDkk, noNet, deduction, taxable, foTax, socialPaid: social * rate, credit, rest, allFees};
  for (const key of outputs) {
    el(key).textContent = invalid || !Number.isFinite(totals[key]) ? '–' : format.format(totals[key]) + (['monthly','annual','net'].includes(key) ? '' : ' DKK');
  }
  if (!annualMode) return;
  let savedTotal = 0;
  months.forEach(({plan, saved, remaining}, index) => {
    const target = round(reserve * (index + 1) / 12);
    const previous = round(reserve * index / 12);
    savedTotal += saved.validity.valid ? (saved.valueAsNumber || 0) : 0;
    plan.textContent = invalid ? '–' : format.format(target - previous);
    remaining.textContent = invalid ? '–' : format.format(Math.max(0, target - savedTotal));
  });
}
async function refreshExchangeRate() {
  const year = el('year').value;
  const request = ++exchangeRequest;
  exchangeRate = null;
  exchangeStatus = 'Heinti miðalkurs frá ECB…';
  update();
  try {
    const response = await fetch('/api/exchange-rate?year=' + year, {signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Exchange rate unavailable');
    const data = await response.json();
    if (data.year !== year || !Number.isFinite(data.rate) || data.rate <= 0) throw new Error('Invalid exchange rate');
    if (request !== exchangeRequest) return;
    exchangeRate = data.rate;
    const text = data.rate.toLocaleString('da-DK', {minimumFractionDigits: 4, maximumFractionDigits: 6});
    exchangeStatus = 'ECB-miðalkursur · ' + text + ' DKK/NOK · til og við ' + data.through;
  } catch {
    if (request !== exchangeRequest) return;
    exchangeStatus = 'Miðalkursur ikki tøkur. Tú kanst skriva tín egna kurs.';
  }
  update();
}
async function refreshRate() {
  const year = el('year').value;
  norwayRate = year === '2026' ? 7.6 : null;
  el('rateStatus').textContent = year === '2026' ? 'Norsk folketrygd · 7,60 % (váttaður 2026-satsur)' : 'Heinti norskan sats…';
  update();
  try {
    const response = await fetch('/api/trygdeavgift?year=' + year, {signal: AbortSignal.timeout(7000)});
    if (!response.ok) throw new Error('Rate unavailable');
    const result = await response.json();
    if (year !== el('year').value || result.year !== year) return;
    norwayRate = result.rate;
    el('rateStatus').textContent = 'Norsk folketrygd · ' + format.format(norwayRate) + ' % · Skatteetaten';
  } catch {
    if (year !== el('year').value) return;
    if (norwayRate === null) el('rateStatus').textContent = 'Norskur satsur ikki tøkur hjá Skatteetaten fyri ' + year;
  }
  update();
}
async function refreshTaks() {
  const year = yearInput.value;
  const request = ++taksRequest;
  const cached = ratesByYear[year];
  churchRates = cached?.church ?? (year === '2026' ? church2026 : {});
  foreignRate = cached?.foreignRate ?? 35;
  publicFees = year === '2026'
    ? {health:[175,.7], parental:[0,.86], broadcast:[176,0], unemployment:[0,.6], ameg:[0,3]}
    : year === '2027' ? {broadcast:[180,0]} : {};
  publicFees = {...publicFees, ...cached?.fees};
  deductionRates = cached?.deduction ?? {percent:30, standard:48000, special:year === '2026' ? 96000 : year === '2027' ? 72000 : 48000};
  populateMunicipalities(el('municipality').value, selectedVillage);
  el('taksStatus').textContent = 'Heinti satsir hjá TAKS…';
  update();
  try {
    const response = await fetch('/api/taks-rates?year=' + year, {signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('TAKS unavailable');
    const data = await response.json();
    if (request !== taksRequest || data.year !== year) return;
    churchRates = data.church ?? churchRates;
    publicFees = {...publicFees, ...data.fees};
    deductionRates = data.deduction ?? deductionRates;
    if (Number.isFinite(data.foreignRate)) foreignRate = data.foreignRate;
    ratesByYear[year] = {
      church: data.church ?? cached?.church,
      fees: {...cached?.fees, ...data.fees},
      deduction: data.deduction ?? cached?.deduction,
      foreignRate: data.foreignRate ?? cached?.foreignRate,
    };
    saveInputs();
    const complete = data.church && data.deduction && Number.isFinite(data.foreignRate) && fees.every(fee => fee.id === 'church' || data.fees?.[fee.id]);
    el('taksStatus').textContent = complete ? 'Satsir heintaðir hjá TAKS fyri ' + year + '.'
      : 'Ófullfíggjað TAKS-uppslag fyri ' + year + '. Váttaðir satsir verða brúktir, tá teir eru tøkir.';
  } catch {
    if (request !== taksRequest) return;
    el('taksStatus').textContent = 'TAKS-uppslag ikki tøkt. Váttaðir satsir verða brúktir, tá teir eru tøkir.';
  }
  populateMunicipalities(el('municipality').value, selectedVillage);
  update();
}
function saveInputs() {
  recordsByYear[activeYear] = {...Object.fromEntries(yearInputs.map(field => [field.id, field.value])), village: selectedVillage};
  try {
    localStorage.setItem(storageKey, JSON.stringify({recordsByYear, monthlyEntries, ytdEntries, ratesByYear}));
  } catch {}
}
for (const input of [...inputs, ...ytdFields]) {
  input.addEventListener('input', () => {
    if (input === yearInput) {
      saveInputs();
      activeYear = yearInput.value;
      loadYear();
      refreshTaks();
      refreshExchangeRate();
      refreshRate();
    } else {
      if (ytdFields.includes(input)) ytdEntries[monthKey()] = Object.fromEntries(ytdFields.map(field => [field.id, field.value]));
      if (input.id === 'month') loadYtdTotals();
      if (input.id === 'municipality') {
        selectedVillage = '';
        populateVillages();
      }
      if (input.id === 'village') selectedVillage = input.value;
      update();
    }
    saveInputs();
  });
}
refreshTaks();
refreshRate();
refreshExchangeRate();
