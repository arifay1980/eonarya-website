const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'mesaj.html'), 'utf8');
const start = html.indexOf('  function bicimliMetniGoster(');
const end = html.indexOf('  async function mesajiAc()', start);
assert.ok(start >= 0 && end > start, 'ortak biçimlendirme yardımcısı bulunmalı');

class Node {
  constructor(name, value) { this.name = name; this.value = value; this.children = []; this.style = {}; }
  set textContent(v) { this.children = [new Node('#text', String(v))]; }
  replaceChildren(...items) { this.children = items; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); }
}
const ids = ['mesajBaslik', 'mesajIcerik', 'mesajMaddeler'];
const nodes = Object.fromEntries(ids.map(id => [id, new Node(id)]));
const document = {
  createTextNode: value => new Node('#text', value),
  createElement: name => new Node(name),
  getElementById: id => nodes[id],
};
const { bicimliMetniGoster, mesajIceriginiDoldur } =
  vm.runInNewContext(html.slice(start, end) + '\n({bicimliMetniGoster,mesajIceriginiDoldur})', { document });
const flatten = node => node.name === '#text' ? node.value : node.children.map(flatten).join('');

test('kalın/italik/altı çizili mobil sözdizimi', () => {
  bicimliMetniGoster(nodes.mesajIcerik, 'A **kalın** *italik* __altı__.');
  assert.deepEqual(Array.from(nodes.mesajIcerik.children, x => x.name), ['#text','strong','#text','em','#text','u','#text']);
  assert.equal(flatten(nodes.mesajIcerik), 'A kalın italik altı.');
});
test('ham HTML ve script hiçbir zaman element oluşturmaz', () => {
  bicimliMetniGoster(nodes.mesajIcerik, '<img src=x onerror=alert(1)> **güvenli** <script>alert(2)</script>');
  assert.equal(nodes.mesajIcerik.children[0].name, '#text');
  assert.equal(flatten(nodes.mesajIcerik), '<img src=x onerror=alert(1)> güvenli <script>alert(2)</script>');
  assert.equal(nodes.mesajIcerik.children.some(x => x.name === 'img' || x.name === 'script'), false);
});
test('satır sonu ve işaretsiz metin aynı kalır', () => {
  bicimliMetniGoster(nodes.mesajIcerik, 'İlk satır\nİkinci *satır*\nson');
  assert.equal(flatten(nodes.mesajIcerik), 'İlk satır\nİkinci satır\nson');
  bicimliMetniGoster(nodes.mesajIcerik, 'Bir **tamamlanmamış örnek');
  assert.equal(flatten(nodes.mesajIcerik), 'Bir **tamamlanmamış örnek');
});
test('gövde ve maddeler aynı güvenli renderer; sıfırlama', () => {
  mesajIceriginiDoldur({message_title:'Başlık',message_body:'**Bir**',message_maddeler:['*İki*','__Üç__']});
  assert.equal(nodes.mesajIcerik.children[0].name,'strong');
  assert.equal(nodes.mesajMaddeler.children.length,2);
  assert.equal(nodes.mesajMaddeler.children[0].children[1].children[0].name,'em');
  assert.equal(nodes.mesajMaddeler.children[1].children[1].children[0].name,'u');
  mesajIceriginiDoldur({message_title:'',message_body:'',message_maddeler:[]});
  assert.equal(nodes.mesajMaddeler.style.display,'none');
  assert.equal(nodes.mesajMaddeler.children.length,0);
  assert.equal(nodes.mesajIcerik.children.length,0);
});
test('önizleme ve gerçek teslimat aynı yardımcıya bağlı', () => {
  assert.equal((html.match(/      mesajIceriginiDoldur\(data\);/g)||[]).length,2);
  assert.equal(html.includes("document.getElementById('mesajIcerik').textContent"),false);
  assert.equal(html.includes("String(m).replace(/</g"),false);
});
