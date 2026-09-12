#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.EONARYA_APP_ROOT || path.join(root, '..', 'Eonarya'));
const privatePages = ['mesaj.html', 'bilgi.html', 'onay.html', 'onay-hatirlatma.html', 'tercihler.html'];
const publicPages = ['index.html'];
const legalPages = ['gizlilik.html', 'kullanim-sartlari.html', 'aydinlatma.html', 'kvkk.html', 'ucuncu-kisi-aydinlatma.html'];
const edgeFunctions = ['get-message', 'get-approval-intro', 'approval-response', 'message-opt-out', 'recipient-contact-update'];

function read(base, file) {
  return fs.readFileSync(path.join(base, file), 'utf8');
}

function requireMatch(value, pattern, label) {
  if (!pattern.test(value)) throw new Error(label);
}

function requireText(value, expected, label) {
  if (!value.includes(expected)) throw new Error(label);
}

const content = JSON.parse(read(appRoot, 'supabase/functions/_shared/experience/content.json'));
const recipientContactUpdate = 'İletişim bilgilerinizi güncellemeniz, bu göndericiden gelecekte alacağınız tekrar eden mesajlarda yeni e-posta adresinizin kullanılmasını sağlar. Daha önce gönderilmeye başlanmış teslimatlar bu değişiklikten etkilenmez.';

if (content.DELIVERY_COPY.recipientContactUpdate !== recipientContactUpdate) {
  throw new Error('İletişim güncelleme kapsamı kilitli son metinden saptı');
}

for (const page of privatePages) {
  const html = read(root, page);
  requireMatch(html, /<meta name="robots" content="noindex, nofollow">/, `${page}: noindex eksik`);
  requireMatch(html, /<meta name="referrer" content="no-referrer">/, `${page}: no-referrer eksik`);
  requireMatch(html, /assets\/private-shell\.css/, `${page}: private shell CSS eksik`);
  requireMatch(html, /assets\/private-shell\.js/, `${page}: private shell JS eksik`);
  requireMatch(html, /generated\/experience-content\.js/, `${page}: content registry eksik`);
  requireMatch(html, /captureSensitiveParams\(\['token', 'ot', 'confirm'\]\)/, `${page}: güvenli query yakalama eksik`);
  requireMatch(html, /data-content-path="PRODUCT_COPY\.Eonarya\.short"/, `${page}: private footer ürün metni bağı eksik`);
  requireMatch(html, /data-support-link="help"/, `${page}: Yardım Merkezi bağı eksik`);
  requireMatch(html, /data-support-link="message"/, `${page}: destek mesajı bağı eksik`);
  if (page !== 'tercihler.html') {
    requireText(html, `data-support-href="message" href="${content.SUPPORT_COPY.messageHref}"`, `${page}: yanlış alıcı destek rotası bağı eksik`);
    requireText(html, `>${content.DELIVERY_COPY.wrongRecipientCta}</a>`, `${page}: yanlış alıcı CTA metni saptı`);
  }
  if (/new URLSearchParams\(window\.location\.search\)\.get\('(token|ot|confirm)'\)/.test(html)) {
    throw new Error(`${page}: hassas query doğrudan okunuyor`);
  }
}

for (const page of publicPages) {
  const html = read(root, page);
  requireMatch(html, /data-footer-variant="public"/, `${page}: public footer varyantı eksik`);
  requireMatch(html, /generated\/experience-content\.js/, `${page}: content registry eksik`);
}
for (const page of legalPages) {
  requireMatch(read(root, page), /data-footer-variant="legal"/, `${page}: legal footer varyantı eksik`);
}
requireMatch(read(root, 'yardim.html'), /data-footer-variant="support"/, 'yardim.html: support footer varyantı eksik');

const preferences = read(root, 'tercihler.html');
requireText(preferences, 'data-content-path="DELIVERY_COPY.recipientContactUpdate"', 'tercihler.html: iletişim güncelleme registry bağı eksik');
requireText(preferences, 'const CONTACT_UPDATE_COPY = window.EONARYA_EXPERIENCE.DELIVERY_COPY.recipientContactUpdate;', 'tercihler.html: dinamik iletişim güncelleme registry bağı eksik');
requireText(preferences, recipientContactUpdate, 'tercihler.html: kilitli iletişim güncelleme metni eksik');

const home = read(root, 'index.html');
const hero = content.PRODUCT_COPY.Eonarya.web.title;
requireText(home, `aria-label="${hero}"`, 'Ana sayfa hero metni canonical kaynaktan saptı');
requireText(home, `<em>Senden Sonra</em>`, 'Ana sayfa hero vurgusu eksik');
requireText(home, `content="${hero}"`, 'OG/Twitter açıklaması kilitli hero metninden saptı');
requireText(home, `"description":"${content.PRODUCT_COPY.Eonarya.short}"`, 'Schema açıklaması Eonarya.short kaynağından saptı');
requireText(home, content.PRODUCT_COPY.BendenSonra.web.body, 'Ana sayfa Benden Sonra web metni canonical kaynaktan saptı');
requireText(home, `data-support-link="message">${content.SUPPORT_COPY.messageLabel}</a>`, 'Ana sayfa destek etiketi canonical kaynaktan saptı');

const help = JSON.parse(read(root, 'generated/help-content.json'));
const helpAnswers = Object.fromEntries(help.categories.flatMap((category) => category.questions.map((question) => [question.id, question.answer])));
for (const [questionId, expected] of [
  ['mesaj-nedir', content.PRODUCT_COPY.Mesajlar.canonical],
  ['bs-nedir', content.PRODUCT_COPY.BendenSonra.canonical],
  ['ht-nedir', content.PRODUCT_COPY.Hayattayim.canonical],
  ['gk-nedir', content.PRODUCT_COPY.GuvenilirKisiler.canonical],
  ['plan-nedir', content.PRODUCT_COPY.Planlar.canonical],
]) {
  if (helpAnswers[questionId] !== expected) throw new Error(`Yardım cevabı canonical kaynaktan saptı: ${questionId}`);
}

for (const deprecated of [
  'İnsanların önemli gördükleri şeyleri zaman içinde takip eden',
  'insanların geleceğe bırakmak istedikleri mesajları',
  'yalnızca ölüm sonrası mesajları',
  'yalnızca Benden Sonra mesajları',
  'Bu değişiklik, bu göndericiden gelecekte yapılacak uygun teslimatlarda kullanılacak iletişim adresinizi günceller.',
  'ölüm sonrası mesaj',
  'Önem verdiğin şeyler, zamanı geldiğinde doğru kişiye ulaşsın.',
  'Mesajını bugünden hazırla; kime ulaşacağını ve teslimat sırasını sen belirle.',
  'ilgili kişi olarak liste',
  'hayatta olmadığın doğrulandı',
]) {
  for (const page of [...privatePages, 'index.html', 'yardim.html']) {
    if (read(root, page).includes(deprecated)) throw new Error(`${page}: deprecated metin kaldı: ${deprecated}`);
  }
}

const privateShell = read(root, 'assets/private-shell.js');
requireMatch(privateShell, /history\.replaceState/, 'query cleanup replaceState eksik');
requireMatch(privateShell, /eonaryaPrivateParams/, 'refresh state koruması eksik');
requireMatch(privateShell, /setAttribute\('rel', 'noreferrer'\)/, 'dinamik noreferrer koruması eksik');
if (/localStorage|sessionStorage/.test(privateShell)) throw new Error('Hassas parametreler kalıcı storage kullanıyor');

// Gerçek browser API sözleşmesini küçük bir VM kabuğunda doğrula: ilk açılışta
// query temizlenir, token history.state'e alınır ve temiz URL ile yenileme
// simülasyonunda aynı token geri okunur.
const fakeLocation = { href: 'https://eonarya.com/mesaj.html?preview=1&token=test-token&ot=test-opt' };
const fakeHistory = {
  state: null,
  replaceState(state, _title, nextUrl) {
    this.state = state;
    fakeLocation.href = new URL(nextUrl, fakeLocation.href).href;
  },
};
const fakeDocument = { body: {}, querySelectorAll: () => [] };
const context = {
  URL,
  window: { location: fakeLocation, history: fakeHistory, EONARYA_EXPERIENCE: {} },
  document: fakeDocument,
  MutationObserver: class { observe() {} },
  Element: class {},
};
vm.runInNewContext(privateShell, context);
const firstCapture = context.window.EonaryaPrivate.captureSensitiveParams(['token', 'ot', 'confirm']);
if (fakeLocation.href !== 'https://eonarya.com/mesaj.html?preview=1') throw new Error('Query cleanup URL sonucu hatalı');
if (firstCapture.token !== 'test-token' || firstCapture.ot !== 'test-opt') throw new Error('İlk token yakalama başarısız');
const refreshCapture = context.window.EonaryaPrivate.captureSensitiveParams(['token', 'ot', 'confirm']);
if (refreshCapture.token !== 'test-token' || refreshCapture.ot !== 'test-opt') throw new Error('Cleanup sonrası refresh token koruması başarısız');

for (const fn of edgeFunctions) {
  const source = read(appRoot, `supabase/functions/${fn}/index.ts`);
  requireMatch(source, /'Cache-Control': 'no-store'/, `${fn}: no-store eksik`);
  for (const status of source.matchAll(/new Response\([\s\S]*?\{\s*status:\s*(\d+)[\s\S]*?\}\s*\)/g)) {
    if (!/headers:[\s\S]*corsHeaders|headers:\s*corsHeaders/.test(status[0])) {
      throw new Error(`${fn}: ${status[1]} yanıtında no-store/CORS header zinciri eksik`);
    }
  }
}

const templates = read(appRoot, 'supabase/functions/_shared/experience/emailShell.ts');
for (const url of [
  'https://www.eonarya.com/assets/email/header-logo.png',
  'https://www.eonarya.com/assets/email/footer-logo.png',
]) {
  if (!templates.includes(url)) throw new Error(`E-posta asset URL uyumluluğu bozuldu: ${url}`);
}

const manifest = JSON.parse(read(root, 'generated/experience-manifest.json'));
for (const expected of [
  'assets/brand/logo-dark.png',
  'assets/brand/logo-light.png',
  'assets/brand/symbol-dark.png',
  'assets/email/header-logo.png',
  'assets/email/footer-logo.png',
]) {
  if (!manifest.outputs[expected]) throw new Error(`Canonical logo manifest kaydı eksik: ${expected}`);
}

const design = JSON.parse(read(appRoot, 'supabase/functions/_shared/experience/design-tokens.json'));
const siteCss = read(root, 'assets/site.css').toLowerCase();
for (const name of ['night', 'paper', 'ink', 'soft', 'line', 'accent', 'accentDark', 'orbit', 'white', 'whiteSoft']) {
  const value = design.colors[name];
  if (!siteCss.includes(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${String(value).toLowerCase()}`)) {
    throw new Error(`Ana site ile canonical renk tokenı drift etti: ${name}`);
  }
}

// UI çalışmasının kritik backend semantiğini sessizce değiştirmediğini doğrulayan
// davranış sözleşmeleri. Bunlar yalnız dosya varlığı değil, kullanıcıya dönen
// hata/erişim ve tek-kullanım kurallarının birlikte korunmasını sınar.
const getMessage = read(appRoot, 'supabase/functions/get-message/index.ts');
for (const contract of [
  /SURE_GUN_FREE\s*=\s*7/,
  /SURE_GUN_PLUS\s*=\s*30/,
  /hata: 'erisim_suresi_doldu'/,
  /ac \? 'MESSAGE_OPENED' : 'PAGE_OPENED'/,
  /if \(ac\) \{[\s\S]*response\.message_body/,
]) requireMatch(getMessage, contract, `get-message davranış sözleşmesi eksik: ${contract}`);

const approval = read(appRoot, 'supabase/functions/approval-response/index.ts');
for (const contract of [
  /used_at\)\s+return \{ ok: false, hata: 'kullanilmis_link' \}/,
  /expires_at\)[\s\S]*hata: 'suresi_dolmus'/,
  /current_step !== 'onay_grubunda'/,
  /attempt_number !== \(protokol as any\)\.verification_attempt_count/,
  /\.update\(\{ used_at: simdi \}\)[\s\S]*\.is\('used_at', null\)/,
]) requireMatch(approval, contract, `approval single-use/state sözleşmesi eksik: ${contract}`);

const optOut = read(appRoot, 'supabase/functions/message-opt-out/index.ts');
for (const contract of [
  /recipient_type/,
  /message_opt_outs/,
  /onayGrubuEsikKontrolu/,
]) requireMatch(optOut, contract, `opt-out kapsam sözleşmesi eksik: ${contract}`);

const contactUpdate = read(appRoot, 'supabase/functions/recipient-contact-update/index.ts');
for (const contract of [
  /confirm === 'old'/,
  /confirm === 'new'/,
  /req\.method === 'GET'/,
  /req\.method === 'POST'/,
]) requireMatch(contactUpdate, contract, `contact update doğrulama sözleşmesi eksik: ${contract}`);

console.log('✓ Web deneyim regression kontrolleri geçti');
