// Depot geometry (design space 1920x1080). Trucks park nose-up; the building is at the top.
import { easeInOut, easeOut } from "./anim";

export const BAY_COUNT = 10;
export const BAY_PITCH = 112;
export const bayX = (i: number) => 150 + i * BAY_PITCH;
export const TRUCK_W = 84;
export const TRUCK_L = 232;
export const PARK_Y = 500; // centre of a parked truck
export const NOSE_Y = PARK_Y - TRUCK_L / 2; // 384
export const CHARGER_Y = 304;
export const LANE_Y = 884;
export const DEPART_LANE_Y = 780;
export const TURN_R = 132;
export const START_X = -280;
export const EXIT_X = 1560;

export type Pose = { x: number; y: number; nose: number; p: number };

/** Arrival: drive in along the lane, turn left, drive nose-first into the bay. p in 0..1. */
export const arrivalPose = (i: number, p: number): Pose => {
  const bx = bayX(i);
  const xA = bx - TURN_R;
  const L1 = xA - START_X;
  const ARC = (Math.PI * TURN_R) / 2;
  const L2 = LANE_Y - TURN_R - PARK_Y;
  const total = L1 + ARC + L2;
  const s = total * easeOut(Math.min(1, Math.max(0, p)));
  if (s < L1) return { x: START_X + s, y: LANE_Y, nose: 90, p };
  if (s < L1 + ARC) {
    const th = (s - L1) / TURN_R;
    return { x: xA + TURN_R * Math.sin(th), y: LANE_Y - TURN_R + TURN_R * Math.cos(th), nose: 90 - (th * 180) / Math.PI, p };
  }
  return { x: bx, y: LANE_Y - TURN_R - (s - L1 - ARC), nose: 0, p };
};

/** Departure: reverse out of the bay, then drive forward round the corner and away to the right. */
export const departPose = (i: number, p: number): Pose => {
  const bx = bayX(i);
  const yTurn = 912;
  const L1 = yTurn - PARK_Y;
  const ARC = (Math.PI * TURN_R) / 2;
  const L3 = EXIT_X - (bx + TURN_R);
  const total = L1 + ARC + L3;
  const s = total * easeInOut(Math.min(1, Math.max(0, p)));
  if (s < L1) return { x: bx, y: PARK_Y + s, nose: 0, p };
  if (s < L1 + ARC) {
    const th = (s - L1) / TURN_R;
    return { x: bx + TURN_R - TURN_R * Math.cos(th), y: yTurn - TURN_R * Math.sin(th), nose: (th * 180) / Math.PI, p };
  }
  return { x: bx + TURN_R + (s - L1 - ARC), y: yTurn - TURN_R, nose: 90, p };
};

export const parkedPose = (i: number): Pose => ({ x: bayX(i), y: PARK_Y, nose: 0, p: 1 });
