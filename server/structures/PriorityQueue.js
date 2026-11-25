'use strict';

/**
 * Binary min-heap ordered by a comparator (Module 2, also used by Dijkstra).
 *
 * compare(a, b) < 0 means a is served before b.
 * push / pop: O(log n), peek: O(1).
 */
class PriorityQueue {
  constructor(compare) {
    this.compare = compare;
    this.heap = [];
  }

  get size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  peek() {
    return this.heap[0];
  }

  push(value) {
    this.heap.push(value);
    this._siftUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  toArray() {
    return this.heap.slice();
  }

  _siftUp(i) {
    const h = this.heap;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(h[i], h[p]) >= 0) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  _siftDown(i) {
    const h = this.heap;
    const n = h.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let best = i;
      if (l < n && this.compare(h[l], h[best]) < 0) best = l;
      if (r < n && this.compare(h[r], h[best]) < 0) best = r;
      if (best === i) break;
      [h[i], h[best]] = [h[best], h[i]];
      i = best;
    }
  }
}

module.exports = PriorityQueue;
