'use strict';

/**
 * Hash map with separate chaining (Module 1).
 *
 * Keys are hashed with djb2 and placed in a bucket. Collisions are kept in
 * the same bucket as a short chain. When the load factor passes 0.75 the
 * bucket array doubles and every entry is re-hashed.
 *
 * Average lookup, insert and delete: O(1). Worst case (all keys in one
 * bucket): O(n).
 */
class HashMap {
  constructor(capacity = 8) {
    this.buckets = Array.from({ length: capacity }, () => []);
    this.size = 0;
    this.maxLoad = 0.75;
    this.resizes = 0;
  }

  static hash(key) {
    const s = String(key);
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; // h * 33 + c
    }
    return h;
  }

  indexOf(key) {
    return HashMap.hash(key) % this.buckets.length;
  }

  set(key, value) {
    const bucket = this.buckets[this.indexOf(key)];
    const entry = bucket.find((e) => e[0] === key);
    if (entry) {
      entry[1] = value;
      return false;
    }
    bucket.push([key, value]);
    this.size++;
    if (this.size / this.buckets.length > this.maxLoad) this._resize();
    return true;
  }

  get(key) {
    const entry = this.buckets[this.indexOf(key)].find((e) => e[0] === key);
    return entry ? entry[1] : undefined;
  }

  has(key) {
    return this.buckets[this.indexOf(key)].some((e) => e[0] === key);
  }

  delete(key) {
    const bucket = this.buckets[this.indexOf(key)];
    const i = bucket.findIndex((e) => e[0] === key);
    if (i === -1) return false;
    bucket.splice(i, 1);
    this.size--;
    return true;
  }

  values() {
    const out = [];
    for (const b of this.buckets) for (const e of b) out.push(e[1]);
    return out;
  }

  keys() {
    const out = [];
    for (const b of this.buckets) for (const e of b) out.push(e[0]);
    return out;
  }

  clear() {
    this.buckets = Array.from({ length: 8 }, () => []);
    this.size = 0;
    this.resizes = 0;
  }

  /** Bucket layout for the visual inspector. */
  snapshot() {
    return {
      capacity: this.buckets.length,
      size: this.size,
      loadFactor: +(this.size / this.buckets.length).toFixed(3),
      resizes: this.resizes,
      buckets: this.buckets.map((b) => b.map((e) => e[0])),
    };
  }

  _resize() {
    const old = this.buckets;
    this.buckets = Array.from({ length: old.length * 2 }, () => []);
    this.size = 0;
    this.resizes++;
    for (const b of old) for (const [k, v] of b) this.set(k, v);
  }
}

module.exports = HashMap;
