'use strict';

/**
 * Starting scenario. Values follow the worked examples in the project
 * presentation: 120 water packs shared between Ward 7 (High, 80),
 * Ward 3 (Medium, 60) and Ward 9 (Low, 40), and the Warehouse -> Junction A
 * -> Ward 7 route (8 + 7 = 15 min) against the route via Junction B
 * (10 + 12 = 22 min).
 */
module.exports = {
  nodes: [
    { node_id: 'WH', name: 'Central Warehouse', node_type: 'warehouse', pos_x: 70, pos_y: 250 },
    { node_id: 'JA', name: 'Junction A', node_type: 'junction', pos_x: 250, pos_y: 140 },
    { node_id: 'JB', name: 'Junction B', node_type: 'junction', pos_x: 250, pos_y: 380 },
    { node_id: 'JC', name: 'Junction C', node_type: 'junction', pos_x: 440, pos_y: 60 },
    { node_id: 'JD', name: 'Junction D', node_type: 'junction', pos_x: 440, pos_y: 400 },
    { node_id: 'W07', name: 'Ward 7', node_type: 'area', pos_x: 600, pos_y: 200 },
    { node_id: 'W03', name: 'Ward 3', node_type: 'area', pos_x: 650, pos_y: 50 },
    { node_id: 'W09', name: 'Ward 9', node_type: 'area', pos_x: 640, pos_y: 400 },
    { node_id: 'W12', name: 'Ward 12', node_type: 'area', pos_x: 800, pos_y: 300 },
    { node_id: 'SC2', name: 'Shelter Camp 2', node_type: 'area', pos_x: 830, pos_y: 120 },
  ],

  roads: [
    { road_id: 'R01', from_node: 'WH', to_node: 'JA', travel_min: 8, status: 'open' },
    { road_id: 'R02', from_node: 'WH', to_node: 'JB', travel_min: 10, status: 'open' },
    { road_id: 'R03', from_node: 'JA', to_node: 'W07', travel_min: 7, status: 'open' },
    { road_id: 'R04', from_node: 'JB', to_node: 'W07', travel_min: 12, status: 'open' },
    { road_id: 'R05', from_node: 'JA', to_node: 'JC', travel_min: 6, status: 'open' },
    { road_id: 'R06', from_node: 'JC', to_node: 'W03', travel_min: 5, status: 'open' },
    { road_id: 'R07', from_node: 'JC', to_node: 'W07', travel_min: 9, status: 'open' },
    { road_id: 'R08', from_node: 'JB', to_node: 'JD', travel_min: 7, status: 'open' },
    { road_id: 'R09', from_node: 'JD', to_node: 'W09', travel_min: 6, status: 'open' },
    { road_id: 'R10', from_node: 'W07', to_node: 'W12', travel_min: 8, status: 'open' },
    { road_id: 'R11', from_node: 'W09', to_node: 'W12', travel_min: 9, status: 'open' },
    { road_id: 'R12', from_node: 'W03', to_node: 'SC2', travel_min: 7, status: 'open' },
    { road_id: 'R13', from_node: 'W12', to_node: 'SC2', travel_min: 10, status: 'open' },
    { road_id: 'R14', from_node: 'W07', to_node: 'SC2', travel_min: 13, status: 'open' },
    { road_id: 'R15', from_node: 'W07', to_node: 'W09', travel_min: 11, status: 'open' },
  ],

  items: [
    { item_id: 'WTR', name: 'Water packs', unit: 'packs', on_hand: 120, reserved: 0 },
    { item_id: 'FOOD', name: 'Food kits', unit: 'kits', on_hand: 150, reserved: 0 },
    { item_id: 'MED', name: 'Medicine kits', unit: 'kits', on_hand: 45, reserved: 0 },
    { item_id: 'HYG', name: 'Hygiene kits', unit: 'kits', on_hand: 70, reserved: 0 },
    { item_id: 'TARP', name: 'Tarpaulin sheets', unit: 'sheets', on_hand: 30, reserved: 0 },
  ],

  requests: [
    { request_id: 'R-101', area_id: 'W07', item_id: 'WTR', quantity: 80, urgency: 3, requested_at: '2026-11-25 06:10:00' },
    { request_id: 'R-102', area_id: 'W03', item_id: 'WTR', quantity: 60, urgency: 2, requested_at: '2026-11-25 06:25:00' },
    { request_id: 'R-103', area_id: 'W09', item_id: 'WTR', quantity: 40, urgency: 1, requested_at: '2026-11-25 06:40:00' },
    { request_id: 'R-104', area_id: 'SC2', item_id: 'FOOD', quantity: 90, urgency: 3, requested_at: '2026-11-25 06:15:00' },
    { request_id: 'R-105', area_id: 'W12', item_id: 'FOOD', quantity: 70, urgency: 2, requested_at: '2026-11-25 06:50:00' },
    { request_id: 'R-106', area_id: 'W07', item_id: 'MED', quantity: 25, urgency: 3, requested_at: '2026-11-25 07:05:00' },
    { request_id: 'R-107', area_id: 'SC2', item_id: 'MED', quantity: 30, urgency: 2, requested_at: '2026-11-25 07:20:00' },
    { request_id: 'R-108', area_id: 'W09', item_id: 'HYG', quantity: 50, urgency: 2, requested_at: '2026-11-25 07:30:00' },
    { request_id: 'R-109', area_id: 'SC2', item_id: 'TARP', quantity: 40, urgency: 3, requested_at: '2026-11-25 07:45:00' },
    { request_id: 'R-110', area_id: 'W03', item_id: 'HYG', quantity: 35, urgency: 1, requested_at: '2026-11-25 08:00:00' },
  ],
};
