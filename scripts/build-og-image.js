#!/usr/bin/env node
// Paylaşım görseli (Open Graph / Twitter) üreticisi — Y-09 MD-011/124.
// Kullanım: node scripts/build-og-image.js --screen <gerçek-ekran-goruntusu> [--crop-top <px>] [--crop-height <px>] [--out <dosya>]
// Ekran görüntüsü gerçek uygulama çıktısı olmalıdır; bu betik ekranın içeriğini değiştirmez, yalnız kırpar ve yerleştirir.
const path = require('node:path');

const websiteRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.EONARYA_APP_ROOT || path.join(websiteRoot, '..', 'Eonarya'));
const sharp = require(path.join(appRoot, 'node_modules', 'sharp'));
const FONT_DIR = path.join(appRoot, 'node_modules', '@expo-google-fonts', 'manrope');

const W = 1200;
const H = 630;
const ARKA = '#131218';
const BASLIK = 'Bazı sözler\ndoğru zamanı bekler.';
const SLOGAN = 'ZAMANIN ÖTESİNE BIRAK';

function arg(ad, varsayilan) {
  const i = process.argv.indexOf(`--${ad}`);
  return i > -1 ? process.argv[i + 1] : varsayilan;
}

async function metin(text, { agirlik, boyut, renk, aralik = 0, satirAraligi = 0 }) {
  const fontfile = path.join(FONT_DIR, agirlik, `Manrope_${agirlik}.ttf`);
  const kacisli = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${renk}" letter_spacing="${Math.round(aralik * 1024)}">${kacisli}</span>`,
      font: `Manrope ${boyut}px`,
      fontfile,
      rgba: true,
      spacing: satirAraligi,
    },
  }).png().toBuffer({ resolveWithObject: true });
  return { input: data, width: info.width, height: info.height };
}

async function main() {
  const ekran = arg('screen');
  if (!ekran) throw new Error('--screen <gerçek ekran görüntüsü> zorunlu');
  const cikti = path.resolve(arg('out', path.join(websiteRoot, 'assets', 'social', 'eonarya-og.jpg')));
  const meta = await sharp(ekran).metadata();
  const cropTop = Number(arg('crop-top', 0));
  const cropHeight = Number(arg('crop-height', meta.height - cropTop));

  // Telefon çerçevesi: gerçek ekran görüntüsü yuvarlatılmış köşeyle sağda.
  const telefonH = 570;
  const kirpik = await sharp(ekran).extract({ left: 0, top: cropTop, width: meta.width, height: cropHeight })
    .resize({ height: telefonH }).png().toBuffer({ resolveWithObject: true });
  const telefonW = kirpik.info.width;
  const maske = Buffer.from(`<svg width="${telefonW}" height="${telefonH}"><rect width="${telefonW}" height="${telefonH}" rx="28" ry="28"/></svg>`);
  const telefon = await sharp(kirpik.data).composite([{ input: maske, blend: 'dest-in' }]).png().toBuffer();

  const logo = await sharp(path.join(websiteRoot, 'assets', 'brand', 'logo-light.png')).resize({ width: 450 }).png().toBuffer({ resolveWithObject: true });
  const slogan = await metin(SLOGAN, { agirlik: '600SemiBold', boyut: 20, renk: '#B5A7D2', aralik: 4.5 });
  const baslik = await metin(BASLIK, { agirlik: '500Medium', boyut: 52, renk: '#F4F1F8', satirAraligi: 14 });

  const sol = 80;
  const solMaxW = W - sol - telefonW - 90;
  if (baslik.width > solMaxW) throw new Error(`Başlık sol alana sığmıyor (${baslik.width}px > ${solMaxW}px)`);

  await sharp({ create: { width: W, height: H, channels: 3, background: ARKA } })
    .composite([
      { input: logo.data, left: sol, top: 90 },
      { input: slogan.input, left: sol, top: 268 },
      { input: baslik.input, left: sol, top: 318 },
      { input: telefon, left: W - telefonW - 70, top: Math.round((H - telefonH) / 2) },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(cikti);
  const son = await sharp(cikti).metadata();
  console.log(`✓ ${path.relative(process.cwd(), cikti)} ${son.width}×${son.height}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
