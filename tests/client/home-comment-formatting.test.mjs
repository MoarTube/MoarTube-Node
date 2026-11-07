import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/javascript/home.js', 'utf8');
const start = source.indexOf('  function commentExcerpt(');
const end = source.indexOf('  function commentCard(', start);
const context = vm.createContext({
  readableComment: text => text,
  watch: id => '/watch?v=' + encodeURIComponent(id),
  node: (tag, className, text) => ({
    tag, className, children: text === undefined ? [] : [text],
    append(...items) { this.children.push(...items); },
  }),
});
vm.runInContext(source.slice(start, end), context);
const excerpt = text => context.commentExcerpt({ videoId: 'sample', text });
const textContent = node => typeof node === 'string' ? node : node.children.map(textContent).join('');
const anchors = node => typeof node === 'string' ? [] : [
  ...(node.tag === 'a' ? [node] : []), ...node.children.flatMap(anchors),
];

test('separates quote reference, quoted text, and reply with original line breaks', () => {
  const result = excerpt('>>3\n> This is pretty cool!\nI KNOW!');
  assert.equal(textContent(result), '>>3\n> This is pretty cool!\nI KNOW!');
  assert.equal(result.children[0].className, 'comment-line');
  assert.equal(result.children[2].className, 'comment-quote');
  assert.equal(result.children[4].className, 'comment-line');
  const [link] = anchors(result);
  assert.equal(link.href, '/watch?v=sample#p3');
  assert.equal(link.target, undefined);
  assert.equal(link.rel, 'noopener noreferrer');
});

test('links multiple references and nested quotes while rejecting invalid IDs', () => {
  const result = excerpt('>>1 and >>02\n>>>3\n>>0 >>9007199254740992');
  assert.equal(result.children[2].className, 'comment-quote');
  assert.deepEqual(anchors(result).map(link => link.href), [
    '/watch?v=sample#p1', '/watch?v=sample#p2', '/watch?v=sample#p3',
  ]);
  assert.equal(textContent(result), '>>1 and >>02\n>>>3\n>>0 >>9007199254740992');
});

test('keeps HTML-like comment content as text and retains blank lines', () => {
  const input = '<img src=x onerror=alert(1)>\n\n> quoted <script>\nreply';
  const result = excerpt(input);
  assert.equal(textContent(result), input);
  assert.equal(result.children.every(child => typeof child === 'string' || child.tag === 'span'), true);
  assert.equal(anchors(result).length, 0);
});
