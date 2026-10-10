import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "./db";

export interface StreamSlot {
  id: number;
  weekday: number; // 0=Sun..6=Sat
  start_time: string;
  timezone: string;
  title: string;
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getStreamSchedule(): Promise<StreamSlot[]> {
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT id, weekday, start_time, timezone, title FROM stream_schedule WHERE active = 1 ORDER BY weekday ASC, start_time ASC"
    );
    return rows as StreamSlot[];
  } catch {
    return [];
  }
}
