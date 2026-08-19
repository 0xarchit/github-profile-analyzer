export function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "#22c55e";
  if (grade === "B") return "#06b6d4";
  if (grade === "C") return "#facc15";
  if (grade === "D") return "#f97316";
  return "#ef4444";
}
