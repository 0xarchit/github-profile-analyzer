import clsx from "clsx";
import { ClassNameValue, twMerge } from "tailwind-merge";

export function cn(...classes: ClassNameValue[]) {
  return twMerge(clsx(classes));
}

export function getHeatmapColor(count: number) {
  if (count === 0) return "#ffffff";
  if (count < 5) return "#fef9c3";
  if (count < 10) return "#fde047";
  if (count < 20) return "#facc15";
  return "#eab308";
}

export function getPDFHeatmapColor(count: number) {
  if (count === 0) return "#f3f4f6";
  if (count < 5) return "#fef9c3";
  if (count < 10) return "#fde047";
  if (count < 20) return "#facc15";
  return "#eab308";
}
