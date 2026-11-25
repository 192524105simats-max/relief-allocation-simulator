'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const URG = { 3: 'High', 2: 'Medium', 1: 'Low' };
const STATUS_LABEL = {
  pending: 'Pending', partial: 'Partly covered', allocated: 'Covered', fulfilled: 'Fulfilled',
  reserved: 'Reserved', dispatched: 'In transit', delivered: 'Delivered',
};

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const fmt = {
  n: (v) => (v === null || v === undefined ? '–' : Number(v).toLocaleString('en-IN')),
  time: (s) => (s ? s.slice(11, 16) : '–'),
  dateTime: (s) => {
    if (!s) return '–';
    const d = new Date(s.replace(' ', 'T'));
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${s.slice(11, 16)}`;
  },
  urg: (u) => `<span class="urg u${u}">${URG[u]}</span>`,
  status: (s) => `<span class="pill ${s}">${STATUS_LABEL[s] || s}</span>`,
};

function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = `toast${isError ? ' err' : ''}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, isError ? 5000 : 2800);
}

function table(cols, rows, { empty = 'Nothing to show.', foot = '', rowAttr = () => '' } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const head = cols.map((c) => `<th class="${c.cls || ''}">${c.label}</th>`).join('');
  const body = rows.map((r) => `<tr ${rowAttr(r)}>${cols.map((c) => `<td class="${c.cls || ''}">${c.html(r)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
}

function localInputNow() {
  const d = new Date();
  d.setSeconds(0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function svg(tag, attrs = {}, inner = '') {
  const a = Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
  return `<${tag} ${a}>${inner}</${tag}>`;
}
