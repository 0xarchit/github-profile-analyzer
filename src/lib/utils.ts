import clsx from "clsx";
import { ClassNameValue, twMerge } from "tailwind-merge";

export function cn(...classes: ClassNameValue[]) {
  return twMerge(clsx(classes));
}

function resolveHeatmapColor(count: number, zeroColor: string) {
  if (count === 0) return zeroColor;
  if (count < 5) return "#fef9c3";
  if (count < 10) return "#fde047";
  if (count < 20) return "#facc15";
  return "#eab308";
}

export function getHeatmapColor(count: number) {
  return resolveHeatmapColor(count, "#ffffff");
}

export function getPDFHeatmapColor(count: number) {
  return resolveHeatmapColor(count, "#f3f4f6");
}
