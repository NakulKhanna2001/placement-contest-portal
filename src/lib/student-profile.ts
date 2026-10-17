export const campuses = ["sonepat", "bengaluru", "pune", "hyderabad"] as const;
export type Campus = typeof campuses[number];
export const campusLabels: Record<Campus, string> = { sonepat: "Sonepat", bengaluru: "Bengaluru", pune: "Pune", hyderabad: "Hyderabad" };
export const studyYears = [1, 2, 3, 4] as const;
export const yearLabels: Record<number, string> = { 1: "1st year", 2: "2nd year", 3: "3rd year", 4: "4th year" };
export type StudentDetails = { campus: Campus; studyYear: number };

export function hasStudentDetails(value: { campus?: string | null; studyYear?: number | null } | null | undefined): value is StudentDetails {
  return !!value && campuses.some(campus => campus === value.campus) && studyYears.some(year => year === value.studyYear);
}
