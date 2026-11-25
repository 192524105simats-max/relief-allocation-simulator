'use strict';

const PriorityQueue = require('./PriorityQueue');

/**
 * Undirected weighted road graph (Module 3).
 *
 * Nodes are warehouses, junctions and affected areas. Each open road is an
 * edge with a non-negative travel time in minutes. Blocked roads stay in the
 * graph but are skipped by the shortest-path search.
 */
class Graph {
  constructor() {
    this.adj = new Map(); // nodeId -> [{ to, weight, roadId }]
    this.roads = new Map(); // roadId -> road
  }

  addNode(id) {
    if (!this.adj.has(id)) this.adj.set(id, []);
  }

  addRoad(road) {
    this.addNode(road.from_node);
    this.addNode(road.to_node);
    this.roads.set(road.road_id, road);
    this.adj.get(road.from_node).push({ to: road.to_node, roadId: road.road_id });
    this.adj.get(road.to_node).push({ to: road.from_node, roadId: road.road_id });
  }

  /**
   * Dijkstra from source. Returns distances, the path to target and a step
   * trace that the front end replays.
   */
  dijkstra(source, target) {
    const dist = {};
    const prev = {};
    const visited = new Set();
    for (const id of this.adj.keys()) {
      dist[id] = Infinity;
      prev[id] = null;
    }
    dist[source] = 0;

    const pq = new PriorityQueue((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
    pq.push({ id: source, d: 0 });
    const steps = [];

    while (!pq.isEmpty()) {
      const { id: u, d } = pq.pop();
      if (visited.has(u) || d > dist[u]) continue;
      visited.add(u);

      const relaxed = [];
      for (const { to: v, roadId } of this.adj.get(u)) {
        const road = this.roads.get(roadId);
        if (road.status !== 'open' || visited.has(v)) continue;
        const nd = dist[u] + road.travel_min;
        const improved = nd < dist[v];
        if (improved) {
          dist[v] = nd;
          prev[v] = u;
          pq.push({ id: v, d: nd });
        }
        relaxed.push({ to: v, roadId, candidate: nd, improved });
      }

      steps.push({
        visit: u,
        dist: Graph._finite(dist),
        relaxed,
        frontier: pq.toArray().filter((e) => !visited.has(e.id)).map((e) => e.id),
      });
      if (u === target) break;
    }

    const path = [];
    const roadsOnPath = [];
    if (target && dist[target] !== Infinity) {
      for (let at = target; at !== null; at = prev[at]) path.unshift(at);
      for (let i = 1; i < path.length; i++) {
        roadsOnPath.push(this._roadBetween(path[i - 1], path[i]));
      }
    }

    return {
      source,
      target,
      reachable: target ? dist[target] !== Infinity : true,
      distance: target && dist[target] !== Infinity ? dist[target] : null,
      path,
      roads: roadsOnPath,
      dist: Graph._finite(dist),
      steps,
    };
  }

  _roadBetween(a, b) {
    let best = null;
    for (const { to, roadId } of this.adj.get(a)) {
      const r = this.roads.get(roadId);
      if (to === b && r.status === 'open' && (!best || r.travel_min < best.travel_min)) best = r;
    }
    return best ? best.road_id : null;
  }

  static _finite(dist) {
    const out = {};
    for (const k of Object.keys(dist)) out[k] = dist[k] === Infinity ? null : dist[k];
    return out;
  }
}

module.exports = Graph;
