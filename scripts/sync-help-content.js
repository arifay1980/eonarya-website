#!/usr/bin/env node
/*
 * Yardım Merkezi içeriğini kardeş 'Eonarya' uygulama reposundaki tek kaynaktan
 * (shared/content/helpContent.data.js) statik olarak
 * (AST üzerinden, hiç kod çalıştırmadan) okuyup web sitesine aktarır.
 * Kullanım: bkz. scripts/README.md.
 *
 * Çıktı:
 *  - generated/help-content.json   (GENERATED — DO NOT EDIT)
 *  - yardim.html içindeki <!-- GENERATED:HELP-CONTENT:START --> ... END bloğu
 */
'use strict';

const fs = require('fs');
const path = require('path');

function requireFromEither(pkg, appRepoDir) {
  try {
    return require(pkg);
  } catch (e) {
    const fallback = path.join(appRepoDir, 'node_modules', pkg);
    try {
      return require(fallback);
    } catch (e2) {
      throw new Error(
        `'${pkg}' bulunamadı. Ya eonarya-website içinde 'npm install' çalıştırın ` +
        `ya da EONARYA_APP_REPO ortam değişkeninin (varsayılan: kardeş '../Eonarya' klasörü) ` +
        `geçerli bir Eonarya uygulama reposu checkout'una işaret ettiğinden emin olun.\n` +
        `Denenen yollar: require('${pkg}'), '${fallback}'`
      );
    }
  }
}

const APP_REPO = process.env.EONARYA_APP_REPO
  ? path.resolve(process.env.EONARYA_APP_REPO)
  : path.resolve(__dirname, '../../Eonarya');

if (!fs.existsSync(APP_REPO)) {
  console.error(`HATA: Uygulama reposu bulunamadı: ${APP_REPO}`);
  console.error(`EONARYA_APP_REPO ortam değişkeniyle doğru yolu belirtin.`);
  process.exit(1);
}

const parser = requireFromEither('@babel/parser', APP_REPO);
const traverseModule = requireFromEither('@babel/traverse', APP_REPO);
const traverse = traverseModule.default || traverseModule;

const HELP_CONTENT_PATH = path.join(APP_REPO, 'shared/content/helpContent.data.js');
const UI_SABITLERI_PATH = path.join(APP_REPO, 'shared/uiSabitleri.js');
const EXPERIENCE_CONTENT_PATH = path.join(
  APP_REPO, 'supabase/functions/_shared/experience/content.json'
);
const OUTPUT_JSON = path.join(__dirname, '../generated/help-content.json');
const YARDIM_HTML = path.join(__dirname, '../yardim.html');
const CHECK_ONLY = process.argv.includes('--check');

function parseFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  return parser.parse(code, { sourceType: 'module', plugins: [] });
}

function getBooleanFlag(ast, name) {
  let value;
  traverse(ast, {
    VariableDeclarator(p) {
      if (p.node.id.type === 'Identifier' && p.node.id.name === name && p.node.init) {
        if (p.node.init.type === 'BooleanLiteral') value = p.node.init.value;
      }
    },
  });
  if (typeof value !== 'boolean') {
    throw new Error(`${name}, ${UI_SABITLERI_PATH} içinde boolean literal olarak bulunamadı.`);
  }
  return value;
}

function memberPath(node) {
  const parts = [];
  let cursor = node;
  while (cursor && cursor.type === 'MemberExpression') {
    if (cursor.computed && cursor.property.type === 'StringLiteral') parts.unshift(cursor.property.value);
    else if (!cursor.computed && cursor.property.type === 'Identifier') parts.unshift(cursor.property.name);
    else return null;
    cursor = cursor.object;
  }
  if (!cursor || cursor.type !== 'Identifier') return null;
  parts.unshift(cursor.name);
  return parts;
}

function valueToJs(node, ctx) {
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'BooleanLiteral':
      return node.value;
    case 'NumericLiteral':
      return node.value;
    case 'TemplateLiteral':
      if (node.expressions.length === 0) {
        return node.quasis.map((q) => q.value.cooked).join('');
      }
      throw new Error('İfade içeren template literal desteklenmiyor: ' + JSON.stringify(node.loc && node.loc.start));
    case 'MemberExpression':
      {
        const parts = memberPath(node);
        if (parts && parts[0] === 'PRODUCT_COPY') {
          let value = ctx.productCopy;
          for (const part of parts.slice(1)) value = value && value[part];
          if (typeof value !== 'string') {
            throw new Error(`Canonical ürün metni bulunamadı: ${parts.join('.')}`);
          }
          return value;
        }
        if (node.property && node.property.type === 'Identifier') {
          return '@icon:' + node.property.name;
        }
        throw new Error('Desteklenmeyen member expression.');
      }
    case 'ObjectExpression':
      return objectExpressionToJs(node, ctx);
    case 'ArrayExpression':
      return arrayExpressionToJs(node, ctx);
    default:
      throw new Error('Desteklenmeyen node tipi: ' + node.type);
  }
}

function objectExpressionToJs(node, ctx) {
  const obj = {};
  for (const prop of node.properties) {
    if (prop.type !== 'ObjectProperty') {
      throw new Error('Desteklenmeyen property tipi: ' + prop.type);
    }
    const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
    obj[key] = valueToJs(prop.value, ctx);
  }
  return obj;
}

function arrayExpressionToJs(node, ctx) {
  const result = [];
  for (const el of node.elements) {
    if (el === null) continue;
    if (el.type === 'SpreadElement') {
      const arg = el.argument;
      if (arg.type === 'ConditionalExpression' && arg.test.type === 'Identifier') {
        const flagName = arg.test.name;
        if (!(flagName in ctx.flags)) {
          throw new Error(`Bilinmeyen flag koşullu spread içinde: ${flagName}`);
        }
        const branch = ctx.flags[flagName] ? arg.consequent : arg.alternate;
        if (branch.type === 'ArrayExpression') {
          result.push(...arrayExpressionToJs(branch, ctx));
        } else {
          throw new Error('Koşullu spread dalı ArrayExpression değil: ' + branch.type);
        }
      } else {
        throw new Error('Desteklenmeyen spread argümanı: ' + arg.type);
      }
    } else {
      result.push(valueToJs(el, ctx));
    }
  }
  return result;
}

function extractHelpCategories(ast, ctx) {
  let categories = null;
  traverse(ast, {
    VariableDeclarator(p) {
      if (
        p.node.id.type === 'Identifier' &&
        p.node.id.name === 'HELP_CATEGORIES_DATA' &&
        p.node.init &&
        p.node.init.type === 'ArrayExpression'
      ) {
        categories = arrayExpressionToJs(p.node.init, ctx);
      }
    },
  });
  if (!categories) throw new Error('HELP_CATEGORIES_DATA bulunamadı: ' + HELP_CONTENT_PATH);
  return categories;
}

// shared/content/helpContent.data.js'te bazı sorular `flag: 'TELEFON_DOGRULAMA_AKTIF'`
// taşır — o flag false ise soru web çıktısına hiç dahil edilmez (uygulamadaki
// TELEFON_DOGRULAMA_AKTIF filtrelemesiyle aynı davranış, K41).
function filterFlaggedQuestions(categories, ctx) {
  for (const cat of categories) {
    cat.questions = cat.questions.filter((q) => {
      if (!q.flag) return true;
      if (!(q.flag in ctx.flags)) {
        throw new Error(`Bilinmeyen flag: ${q.flag} (soru: ${q.id})`);
      }
      return ctx.flags[q.flag];
    });
    for (const q of cat.questions) delete q.flag;
  }
  return categories;
}

function main() {
  const uiAst = parseFile(UI_SABITLERI_PATH);
  const telefonFlag = getBooleanFlag(uiAst, 'TELEFON_DOGRULAMA_AKTIF');

  const helpAst = parseFile(HELP_CONTENT_PATH);
  const experienceContent = JSON.parse(fs.readFileSync(EXPERIENCE_CONTENT_PATH, 'utf8'));
  const ctx = {
    flags: { TELEFON_DOGRULAMA_AKTIF: telefonFlag },
    productCopy: experienceContent.PRODUCT_COPY,
  };
  const categories = filterFlaggedQuestions(extractHelpCategories(helpAst, ctx), ctx);

  let totalQuestions = 0;
  for (const cat of categories) {
    if (!cat.id || !cat.label || !Array.isArray(cat.questions)) {
      throw new Error('Beklenmeyen kategori şekli: ' + JSON.stringify(Object.keys(cat)));
    }
    for (const q of cat.questions) {
      if (!q.id || !q.question || !('answer' in q)) {
        throw new Error('Beklenmeyen soru şekli: ' + JSON.stringify(q));
      }
    }
    totalQuestions += cat.questions.length;
  }

  const mevcutPayload = fs.existsSync(OUTPUT_JSON)
    ? JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'))
    : null;
  const payload = {
    generatedAt: CHECK_ONLY && mevcutPayload?.generatedAt
      ? mevcutPayload.generatedAt
      : new Date().toISOString(),
    sourceNote:
      'GENERATED — DO NOT EDIT. Kaynak: Eonarya/shared/content/helpContent.data.js (npm run sync:help ile üretildi).',
    categories,
  };

  const START = '<!-- GENERATED:HELP-CONTENT:START -->';
  const END = '<!-- GENERATED:HELP-CONTENT:END -->';
  if (!fs.existsSync(YARDIM_HTML)) {
    throw new Error(`yardim.html bulunamadı (önce sayfa şablonu oluşturulmalı): ${YARDIM_HTML}`);
  }
  let html = fs.readFileSync(YARDIM_HTML, 'utf8');
  const startIdx = html.indexOf(START);
  const endIdx = html.indexOf(END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`yardim.html içinde ${START} / ${END} işaretleri bulunamadı.`);
  }
  const jsonBlock = JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\u003e');
  const replacement =
    START +
    '\n    <script id="help-content-data" type="application/json">' +
    jsonBlock +
    '</script>\n    ';
  html = html.slice(0, startIdx) + replacement + html.slice(endIdx);

  const outputJson = JSON.stringify(payload, null, 2) + '\n';
  if (CHECK_ONLY) {
    const mevcutJson = fs.existsSync(OUTPUT_JSON) ? fs.readFileSync(OUTPUT_JSON, 'utf8') : '';
    const mevcutHtml = fs.readFileSync(YARDIM_HTML, 'utf8');
    if (mevcutJson !== outputJson || mevcutHtml !== html) {
      throw new Error('Yardım Merkezi çıktıları canonical kaynaklarla eşleşmiyor. npm run sync:help çalıştırın.');
    }
    console.log(`✓ Yardım Merkezi parity: ${categories.length} kategori, ${totalQuestions} soru`);
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, outputJson, 'utf8');
  fs.writeFileSync(YARDIM_HTML, html, 'utf8');

  console.log(
    `Yardım Merkezi senkronize edildi: ${categories.length} kategori, ${totalQuestions} soru ` +
      `(telefon doğrulama aktif: ${telefonFlag}).`
  );
  console.log(`  → ${path.relative(process.cwd(), OUTPUT_JSON)}`);
  console.log(`  → ${path.relative(process.cwd(), YARDIM_HTML)} (GENERATED bloğu güncellendi)`);
}

main();
